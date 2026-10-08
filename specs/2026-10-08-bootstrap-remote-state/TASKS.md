# Cranny Bootstrap Remote State — Tasks

## Phase 0 — Spec

- [x] **T0.1 Spec and task list** (this folder).

## Phase 1 — Build

- [x] **T1.1 Backend (§2).** `s3` backend block in `infra/bootstrap/main.tf` (key `bootstrap/terraform.tfstate`, `use_lockfile`, `encrypt`); `infra/bootstrap/backend.hcl.example`; `.gitignore` covers `infra/bootstrap/backend.hcl` and `backend_override.tf`; the `backend_config` output's description says it serves both files.
- [x] **T1.2 CI can't reach the key (§3).** Read `ci.tf` and the bucket policy, and simulated the state statements with `aws iam simulate-custom-policy`. No change to `ci.tf` or the bucket policy.
- [x] **T1.3 Docs (§4).** README setup section: day to day, starting from scratch, one-off migration, verification, failure modes. CLAUDE.md infrastructure line.
- [x] **T1.4 Offline checks.** `terraform fmt -check -recursive` in `infra/`; `terraform init -backend=false` and `validate` in `infra/bootstrap`; `terraform init` with the local-backend override in a scratch copy; Prettier on the changed Markdown.

## Phase 2 — Migrate (by hand, when asked; §4)

- [ ] **T2.1 Settings file.** Write `infra/bootstrap/backend.hcl` (the same bucket and region as `infra/backend.hcl`).
- [ ] **T2.2 Migrate.** In the checkout that holds `infra/bootstrap/terraform.tfstate`: `terraform -chdir=infra/bootstrap init -migrate-state -backend-config=backend.hcl`, answer `yes`.
- [ ] **T2.3 Verify.** `terraform -chdir=infra/bootstrap plan` shows no changes; `aws s3 ls s3://<bucket>/bootstrap/` lists `terraform.tfstate`.
- [ ] **T2.4 Clean up.** After an ordinary `apply` has gone through the new backend, delete the local `terraform.tfstate` and `terraform.tfstate.backup`.
- [ ] **T2.5 Fresh checkout.** In a new worktree or clone, write `backend.hcl` and run `init -backend-config=backend.hcl`; `plan` shows no changes and no 409s.
