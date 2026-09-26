# Cranny CI and Deploy on Merge — Tasks

## Phase 0 — Spec

- [x] **T0.1 Spec and task list** (this folder).

## Phase 1 — Build

- [x] **T1.1 CI roles (§2).** `infra/bootstrap/ci.tf`: OIDC provider, `cranny-ci-deploy`, `cranny-ci-plan`, `cranny-ci-read` / `cranny-ci-deploy` policies, `cranny-rooms-boundary`.
- [x] **T1.2 Boundary on the rooms role.** `permissions_boundary` on `aws_iam_role.rooms` in `infra/rooms.tf`.
- [x] **T1.2a Ably key out of Terraform (§2).** `infra/rooms.tf` refers to `/cranny/ably-key` by name; a `removed` block (`destroy = false`) forgets the parameter; no SSM or KMS actions in the CI policies.
- [x] **T1.3 Workflows (§3–§5).** `.github/workflows/ci.yml`, `terraform-plan.yml`, `deploy.yml`, actions pinned to commit SHAs.
- [x] **T1.4 Docs.** README Hosting section and CLAUDE.md commands.
      _Done when:_ `terraform fmt -check` and `validate` pass in `infra/` and `infra/bootstrap/`, `actionlint` passes, and `pnpm format:check` passes.

## Phase 2 — Set up (by hand, when asked; §6)

- [x] **T2.1 OIDC provider.** `aws iam list-open-id-connect-providers`; if GitHub's is there, `terraform -chdir=infra/bootstrap import aws_iam_openid_connect_provider.github <arn>`. (The account had none: nothing to import.)
- [ ] **T2.2 Apply bootstrap.** `terraform -chdir=infra/bootstrap plan` shows only the CI roles, policies, the boundary and the provider; then `apply`.
- [x] **T2.3 Check the policies.** `aws accessanalyzer validate-policy` on `cranny-ci-read` and `cranny-ci-deploy` (no findings); `aws iam simulate-custom-policy` on the rendered read + deploy policies (before apply) allows e.g. `lambda:UpdateFunctionCode` on `cranny-rooms` and `cloudfront:CreateInvalidation`, and denies `iam:AttachRolePolicy` on `cranny-ci-deploy`, `iam:DeleteRolePermissionsBoundary` on `cranny-rooms`, `s3:GetObject` on another bucket, `ssm:GetParameter` and `kms:Decrypt` for the Ably key, and `s3:GetObjectVersion` on the state.
- [ ] **T2.4 Apply infra.** `terraform -chdir=infra plan` shows only the boundary added to `cranny-rooms` and `aws_ssm_parameter.ably_key` no longer managed (not destroyed); `apply`. Must happen before CI's first plan, which can't read the parameter. Then `terraform state list` has no `aws_ssm_parameter`, `aws ssm get-parameter --name /cranny/ably-key` still finds it, and the README's rooms API smoke test still answers `not-found` (the Lambda can still read the key through the boundary).
- [ ] **T2.5 GitHub.**
  ```bash
  gh api -X PUT repos/cookejames/cranny/environments/production \
    -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true'
  gh api -X POST repos/cookejames/cranny/environments/production/deployment-branch-policies -f name=main
  gh variable set AWS_DEPLOY_ROLE_ARN --body "$(terraform -chdir=infra/bootstrap output -raw ci_deploy_role_arn)"
  gh variable set AWS_PLAN_ROLE_ARN --body "$(terraform -chdir=infra/bootstrap output -raw ci_plan_role_arn)"
  gh variable set TF_STATE_BUCKET --body "$(terraform -chdir=infra/bootstrap output -raw bucket)"
  ```
  Then require the `checks` status on `main` (Settings → Branches, or a ruleset).

## Phase 3 — Check

- [ ] **T3.1 PR.** This PR changes `infra/`: CI passes and the plan comment appears with no `AccessDenied` and no changes. A second push updates that comment rather than adding one.
- [ ] **T3.2 Merge.** `deploy.yml`: checks, "No infrastructure changes.", `deploy.sh`, smoke test, all green; the site serves the merged commit.
- [ ] **T3.3 No plan without infra.** A PR that touches neither `infra/` nor `apps/web/security-headers.json` gets CI but no plan run.
