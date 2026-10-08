# Cranny Bootstrap Remote State — Specification

## 1. Summary

`infra/bootstrap/` (the state bucket, and GitHub Actions' IAM roles) keeps its Terraform state in the bucket it creates, under its own key, instead of in a git-ignored local `terraform.tfstate`.

The local file was fragile. A fresh clone or a git worktree has no state, so `terraform apply` tried to re-create everything and failed with `409 EntityAlreadyExists` on the OIDC provider, the `cranny-rooms-boundary` policy and the bucket. With the state in S3, every checkout sees the same state.

This amends `specs/2026-09-25-single-player/SPEC.md` §11 and `specs/2026-09-26-ci-deploy/SPEC.md` §2, which say the bootstrap's state is local.

### Out of scope

- Letting CI plan or apply `infra/bootstrap/`. It stays applied by hand (§3).
- A second bucket for the bootstrap state. The one bucket is enough while CI can't reach the key (§3).
- Moving the bucket's own resources or changing the CI roles' permissions.

## 2. Backend

`infra/bootstrap/main.tf` gains a partial `s3` backend, mirroring `infra/versions.tf`:

```hcl
backend "s3" {
  key          = "bootstrap/terraform.tfstate"
  use_lockfile = true
  encrypt      = true
}
```

- **Bucket and region** come from `infra/bootstrap/backend.hcl` (`terraform init -backend-config=backend.hcl`), which is git-ignored because the bucket name includes the AWS account ID. `infra/bootstrap/backend.hcl.example` shows the format. The account ID is never in the repository.
- **Same bucket, different key.** `infra/` keeps `cranny/terraform.tfstate`; the bootstrap uses `bootstrap/terraform.tfstate`. With `use_lockfile`, each has a `.tflock` object beside it, so the two configurations never block each other.
- **The `backend_config` output** is unchanged: it prints the bucket and region, which are the contents of both `infra/backend.hcl` and `infra/bootstrap/backend.hcl`. Only its description changes, to say so. No second output is needed.
- `.gitignore` covers `infra/bootstrap/backend.hcl` (the existing `*.tfstate` patterns already cover any leftover local state) and `infra/bootstrap/backend_override.tf` (§4).

## 3. CI must not reach the bootstrap state

The bootstrap defines CI's own permissions (`ci.tf`). If CI could write its state, it could in effect rewrite its own roles' policy, defeating "no self-escalation" in the CI spec §2. If it could read it, it would see every resource ID the roles manage. So the new key must fall outside every statement of `cranny-ci-read` and `cranny-ci-deploy`. Checked against `ci.tf` (`local.state_key = "cranny/terraform.tfstate"`):

| Statement                | Resource                                                                   | Reaches `bootstrap/terraform.tfstate`?                                                           |
| ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `StateRead` (read)       | `s3:ListBucket` on the bucket ARN, no prefix condition                     | Only to list key names (as it already lists `cranny/`); `ListBucket` returns no object contents. |
| `StateObjectRead` (read) | `s3:GetObject` on exactly `<bucket>/cranny/terraform.tfstate`              | No: exact key, no wildcard.                                                                      |
| `StateWrite` (deploy)    | `PutObject`, `DeleteObject` on exactly the state key and `…tfstate.tflock` | No: exact keys.                                                                                  |
| `StateLockRead` (deploy) | `GetObject` on exactly `cranny/terraform.tfstate.tflock`                   | No: exact key.                                                                                   |
| Site bucket statements   | `arn:aws:s3:::cranny-site-*`                                               | No: the state bucket is `cranny-terraform-state-<account>`, which that pattern doesn't match.    |

No other statement names S3 objects, there is no prefix or `*` pattern on the state bucket, and neither role has `s3:GetObjectVersion`, so old versions stay unreadable too. The roles' `Get*`/`List*` wildcards are on CloudFront and Lambda only. The `s3:GetBucket*` read is on the site bucket only.

Checked two ways:

- By reading `ci.tf`, as above.
- With `aws iam simulate-custom-policy` (read-only) on the four state statements copied from `ci.tf`, with a placeholder account ID: `GetObject`, `PutObject` and `DeleteObject` on `cranny/terraform.tfstate` are allowed, and the same three on `bootstrap/terraform.tfstate` and `bootstrap/terraform.tfstate.tflock` are `implicitDeny`.

**Bucket policy.** `main.tf`'s only bucket policy statement denies requests that aren't over HTTPS. It grants nothing and doesn't depend on the key, so it needs no change. Access to the new key comes from the identity running Terraform (an administrator, by hand), exactly as for any object in the bucket.

**ci.tf is unchanged.** Nothing is widened, and the PR touching `ci.tf` for DNS stays independent of this one.

## 4. Getting started

The README's setup section documents three flows (each is a handful of commands there):

- **Day to day, fresh clone, new worktree.** The bucket and state exist. Write `infra/backend.hcl` and `infra/bootstrap/backend.hcl` from the examples, then `terraform -chdir=infra/bootstrap init -backend-config=backend.hcl`. `plan` shows no changes.
- **Starting from scratch (new account).** No bucket exists, so the S3 backend can't initialise. `-backend=false` doesn't help, because `apply` needs a working backend. The workable approach is a Terraform override file: `infra/bootstrap/backend_override.tf` containing `terraform { backend "local" {} }` replaces the `s3` block, so `init` and `apply` use a local state. Then write the settings from the `backend_config` output, delete the override, and `init -migrate-state -backend-config=backend.hcl` copies the state into the bucket it just created.
  Checked: in a scratch copy of the bootstrap with that override file, `terraform init` succeeds with a local backend and `validate` passes (the override replaces the `s3` block rather than conflicting with it). The `-migrate-state` step against S3 was not run, as it writes to the real bucket.
- **One-off migration of the existing local state.** `terraform -chdir=infra/bootstrap init -migrate-state -backend-config=backend.hcl` in the checkout that holds `terraform.tfstate`; answer `yes` to the copy prompt.

### Verifying the migration

1. `terraform -chdir=infra/bootstrap plan` reports `No changes`.
2. `aws s3 ls s3://<bucket>/bootstrap/` lists `terraform.tfstate`.
3. Keep `infra/bootstrap/terraform.tfstate` as a backup until both pass and an ordinary `apply` has gone through the new backend, then delete it and its `.backup`. Terraform never deletes the old file, and ignores it once the backend is S3.

### Failure modes

- **Interrupted before the copy.** The local file is untouched and S3 holds nothing (or a complete object, as an S3 upload is atomic). Re-run `init -migrate-state`.
- **Left-over lock** (`Error acquiring the state lock`, from a killed run). Check nobody else is running Terraform, then `terraform -chdir=infra/bootstrap force-unlock <lock id>`.
- **Permissions.** The identity running the bootstrap needs `s3:GetObject`, `PutObject` and `DeleteObject` on `bootstrap/terraform.tfstate` and its `.tflock`, and `s3:ListBucket` on the bucket. Admin rights cover this. The CI roles are meant to lack it.
- **Bucket loss.** The bucket is the bootstrap's own state store, so losing it loses the state too. `prevent_destroy` and versioning guard against it; if it ever happens, everything the bootstrap manages can be re-imported.
- **Changing the backend later.** The bootstrap's `.terraform/` records the backend. A checkout that last initialised with the old (local) configuration shows `Backend configuration changed` and needs `init -backend-config=backend.hcl` (or `-reconfigure` to skip migrating a stale local state).
