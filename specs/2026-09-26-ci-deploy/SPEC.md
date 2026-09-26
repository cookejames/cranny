# Cranny CI and Deploy on Merge — Specification

## 1. Summary

GitHub Actions checks every pull request and deploys every merge to `main`. Before this, `terraform apply` and `scripts/deploy.sh` ran by hand from a developer machine, and nothing checked pull requests.

- **Every PR:** format check, lint, typecheck, test and build (§3).
- **PRs that change `infra/` or the security headers:** a `terraform plan`, posted as one PR comment and updated on each push (§4).
- **Every merge to `main`:** the same checks, then `terraform apply` if the plan has changes, then `scripts/deploy.sh`, then a smoke test. There is no approval step (§5).

This amends the single-player spec (`specs/2026-09-25-single-player/SPEC.md`) §11 and the multiplayer spec §13, which describe deploying by hand. `scripts/deploy.sh` stays, unchanged, for deploys by hand.

### Out of scope

- Preview environments per PR.
- Rotating the Ably key: it stays in SSM, set by hand, and CI can't read it (§2).

## 2. AWS access

Workflows reach AWS through GitHub's OIDC provider, so there are no long-lived keys. Two roles, both defined in `infra/bootstrap/ci.tf`. The repository issues GitHub's immutable subject claims, which carry the owner's and repository's IDs (`repo:cookejames@2211370/cranny@1386290316`, shortened to `<repo>` below), so a deleted and re-created repository of the same name can't assume the roles:

| Role               | Assumed by           | Trust (`sub` claim)             | Policies                             |
| ------------------ | -------------------- | ------------------------------- | ------------------------------------ |
| `cranny-ci-deploy` | `deploy.yml`         | `<repo>:environment:production` | `cranny-ci-read`, `cranny-ci-deploy` |
| `cranny-ci-plan`   | `terraform-plan.yml` | `<repo>:pull_request`           | `cranny-ci-read`                     |

**Least privilege.** Neither role has AdministratorAccess or ReadOnlyAccess. `cranny-ci-read` lists what `terraform plan` reads to refresh `infra/`'s resources; `cranny-ci-deploy` adds what `terraform apply` and `deploy.sh` change. Every action is listed, and scoped to Cranny's resources where the service allows it: the state object, the `cranny-site-*` bucket, the `cranny-rooms` function, role and log group, and Route 53 changes only to `cranny.cooke.ing` and its certificate-validation records. CloudFront, ACM and API Gateway name resources by generated IDs, so those are scoped to their resource type in the account.

**No self-escalation.** The roles live in `infra/bootstrap/` (local state, applied by hand), not in `infra/`, so CI never manages its own permissions. The one role CI can edit, `cranny-rooms`, carries the permissions boundary `cranny-rooms-boundary` (read the Ably key, write its logs), and CI may only edit it while that boundary is in place. So CI can't give the rooms Lambda more power and then run code as it.

**Who can use the roles.** Only the `production` environment, which allows deployments from `main` only, can assume the deploy role. The plan role can be assumed by any pull request run in this repository; fork PRs get no OIDC token (and `terraform-plan.yml` skips them), so that means people with write access.

**No access to the Ably key.** Neither role can read, decrypt or write the `/cranny/ably-key` parameter. Terraform doesn't manage it: managing it, even with `ignore_changes = [value]`, made every refresh decrypt the key and save it in state, where anyone who can read state has it. `infra/rooms.tf` refers to the parameter by name, and a `removed` block (`destroy = false`) took it out of state without deleting it. It's created and set by hand (`aws ssm put-parameter`). Older versions of the state object still hold the key, but the roles can't read old versions (no `s3:GetObjectVersion`). The one route to the key is the one any deploy has: code merged to `main` runs as the rooms Lambda, which reads it.

**Keeping it current.** When `infra/` gains a resource type, its actions go in `infra/bootstrap/ci.tf`, applied by hand before that PR merges. A missing read permission shows up as an `AccessDenied` in the PR's plan comment; a missing write permission fails the deploy, which can be re-run from the Actions tab (`workflow_dispatch`) once it's fixed.

## 3. Checks (`.github/workflows/ci.yml`)

On every pull request, and called by `deploy.yml`: `pnpm install --frozen-lockfile`, then `format:check`, `lint`, `typecheck`, `test` and `build`, on Node from `.nvmrc` and pnpm from `packageManager`. The Ably conformance run skips itself, as there's no `ABLY_KEY`. A new push to a PR cancels the previous run.

## 4. Terraform plan on PRs (`.github/workflows/terraform-plan.yml`)

Runs only when a PR changes a file under `infra/`, or `apps/web/security-headers.json`, which `infra/cdn.tf` reads into CloudFront's response headers policy. It checks `terraform fmt`, runs `validate`, then `plan -lock=false` as `cranny-ci-plan`, and posts the result as a PR comment. Later pushes update the same comment (found by a hidden `<!-- terraform-plan -->` marker) rather than adding more. The comment's heading gives the plan's summary line; the plan itself is in a collapsed block, truncated at 60,000 characters. A failed plan still posts its error, opened, and then fails the job.

## 5. Deploy on merge (`.github/workflows/deploy.yml`)

On every push to `main` (a merged PR), or run by hand:

1. The checks (§3), by calling `ci.yml`. Nothing touches AWS until they pass.
2. As `cranny-ci-deploy`, in the `production` environment: `terraform plan -detailed-exitcode`, and `terraform apply` of that plan only if it has changes.
3. `scripts/deploy.sh`, as run by hand: it runs the checks again (a few minutes, kept so CI and a hand deploy take one path), uploads the rooms Lambda, uploads the app and invalidates CloudFront.
4. The README's smoke test: a deep link answers 200, and the rooms API answers `not-found` for an unknown room, which needs the Lambda to read the Ably key.

Deploys queue (`concurrency: production`, no cancelling), so two merges never deploy at once; GitHub keeps only the newest waiting run.

The Terraform wrapper in `setup-terraform` is off: it would add its own output to the `terraform output -raw` calls in `deploy.sh`.

## 6. Setup (one-time)

1. `terraform -chdir=infra/bootstrap apply`: the OIDC provider (import it first if the account already has one), both roles and the boundary.
2. `terraform -chdir=infra apply`: puts the boundary on `cranny-rooms`.
3. In GitHub: a `production` environment limited to `main`; repository variables `AWS_DEPLOY_ROLE_ARN`, `AWS_PLAN_ROLE_ARN` (from `terraform -chdir=infra/bootstrap output`) and `TF_STATE_BUCKET` (from `infra/backend.hcl`); and branch protection on `main` requiring the `checks` job. Variables rather than secrets: none of them is secret, and like `backend.hcl` they stay out of the repository.

## 7. Supply chain

Every third-party action is pinned to a full commit SHA, with its version in a comment, since the deploy role can change production. Terraform is pinned to the version used locally (1.16.4), and providers by `infra/.terraform.lock.hcl`.
