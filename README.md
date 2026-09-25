# Cranny

**Nine pieces. Seven blocked squares. One grid to fill.**

Cranny is a quick brain-teaser for your phone or browser. Each grid is a 6×6 board with seven blocked squares. Drag nine block pieces into every nook and cranny until the board is full, as fast as you can.

**[Play Cranny → cranny.cooke.ing](https://cranny.cooke.ing)**

<p align="center">
  <img src="docs/screenshots/home.png" alt="Home screen: the Cranny wordmark, a solved board, your best and average times, and the Play button" width="250" />
  <img src="docs/screenshots/play.png" alt="Playing: five pieces placed, and a piece being dragged onto the board with a dashed preview of where it will land" width="250" />
  <img src="docs/screenshots/results.png" alt="Results: the grid complete in 0:57.2, a new personal best, the solved board and stats" width="250" />
</p>

## How to play

- Press **Start** to reveal the blocked squares. The clock starts at the same moment.
- **Drag** pieces from the tray onto the board. A tinted outline shows where a piece will land. The outline turns red if the piece won't fit there.
- **Tap** a piece in the tray to select it, then use **Rotate** and **Flip** to turn it.
- Drag a placed piece to move it, or drag it off the board to put it back. **Clear** returns every piece to the tray.
- The nine pieces cover exactly the 29 open squares, so every grid can be filled. Every grid is checked by a solver before you see it.
- Fill the grid to stop the clock. Your best time, average and number of solved grids are kept on your device.
- **Share grid** sends a link to the exact same grid, so friends can try to beat your time.

The pieces are five four-square blocks (Long bar, Square, Tee, Zig and Ell), two three-square blocks (Bar and Corner), a Domino and a Single.

## Multiplayer

Play the same grids as your friends, at the same time, from **Multiplayer** on the home screen.

- **Create a room** and share its name (three words, like `amber-otter-quilt`) or its link. Friends join with **Join a room**. A room holds 2 to 8 players.
- When everyone presses **Ready**, the same grid is revealed to all of you after a 3-2-1. You see how many pieces the others have placed, never their boards.
- The first to fill the grid starts a 30-second countdown for everyone else. Points go by finishing order (5, 3, 2, then 1 for any other finisher) and add up for as long as the room lasts.
- Anyone who knows a room's name can join it, so a generated name is safer than one you choose.

## Running it locally

You'll need Node 24 (see `.nvmrc`) and pnpm 12.

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

In development, multiplayer runs between tabs of one browser: create a room in one tab and join it from another. To play over the real service instead, run `pnpm --filter @cranny/web dev:ably`. It uses Ably and the deployed rooms API, so you can also join from a phone on your network with `-- --host`.

Other useful commands:

| Command                              | What it does                                                               |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `pnpm test`                          | Runs every package's tests (the Ably ones only if `ABLY_KEY` is in `.env`) |
| `pnpm lint` / `pnpm typecheck`       | Runs ESLint / TypeScript across the workspace                              |
| `pnpm build`                         | Builds the web app and the rooms API Lambda                                |
| `pnpm --filter @cranny/web preview`  | Serves the build with the production security headers (after `pnpm build`) |
| `pnpm --filter @cranny/engine bench` | Times the grid solver against its budget                                   |

In development, add `?solve` to a grid URL (for example `/g/1XDWT5H?solve`) or a room URL. The grid then starts one drop from complete, which is handy for testing the finish.

The repository is a pnpm workspace:

- **`packages/engine`** is the game rules in pure TypeScript: pieces, the solver, the seeded grid generator and grid codes.
- **`packages/multiplayer`** is the multiplayer room logic in pure TypeScript: the protocol, the room rules and scoring, and the interfaces the realtime service and the room directory sit behind.
- **`apps/web`** is the React app.
- **`apps/rooms-api`** is the room directory: a small Lambda that checks whether a room has players and hands out Ably tokens that only work in that room.
- **`infra`** is the Terraform for hosting.

The [single-player spec](specs/2026-09-25-single-player/SPEC.md) and the [multiplayer spec](specs/2026-09-25-multiplayer/SPEC.md) have the full design, and their task lists the build plan. [ABLY.md](specs/2026-09-25-multiplayer/ABLY.md) has what we measured about Ably.

## Deploying

The site is a static build hosted on AWS:

- a private S3 bucket (eu-west-2)
- served by CloudFront with security headers
- an ACM certificate (us-east-1)
- Route 53 records in the existing `cooke.ing` hosted zone
- for multiplayer, the rooms API (API Gateway and a Lambda, reached through CloudFront at `/api/rooms`) and [Ably](https://ably.com) for the realtime messages

Everything is defined in [`infra/`](infra/) and deployed by hand from a developer machine.

### What you need

- Terraform 1.10 or newer and AWS CLI v2. On a Mac: `brew install hashicorp/tap/terraform awscli`.
- AWS credentials for the account, for example from `aws login`. Check them with `aws sts get-caller-identity`. Use an IAM user or role with admin rights rather than the root user.
- The `cooke.ing` hosted zone in that account's Route 53.
- An Ably account (the free package is enough).

### One-time setup

**1. Create the Terraform state bucket.** A small separate configuration creates the S3 bucket that holds Terraform's state. It keeps its own state locally, in `infra/bootstrap/terraform.tfstate`, which is git-ignored. That's fine, because it only manages that one bucket.

```bash
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap apply
terraform -chdir=infra/bootstrap output -raw backend_config > infra/backend.hcl
```

`infra/backend.hcl` is git-ignored because the bucket name contains the AWS account ID. On a fresh clone, where the bucket already exists, copy [`infra/backend.hcl.example`](infra/backend.hcl.example) to `infra/backend.hcl` and fill in the account ID.

**2. Create the hosting.**

```bash
terraform -chdir=infra init -backend-config=backend.hcl
terraform -chdir=infra plan
terraform -chdir=infra apply
```

The first apply takes around 5 to 15 minutes, mostly waiting for the certificate and for CloudFront to go live. It creates:

- the site bucket
- the CloudFront distribution and its security headers policy
- the certificate
- the DNS records for `cranny.cooke.ing`
- the rooms API: its Lambda, HTTP API and the SSM parameter for the Ably key

**3. Give the rooms API an Ably key.** In the Ably dashboard, create an API key restricted to the channels `room:*` with the publish, subscribe, presence and channel-metadata capabilities, and with token revocation on. Then store it where the Lambda reads it:

```bash
aws ssm put-parameter --name /cranny/ably-key --type SecureString --overwrite --value '<key>'
```

Terraform creates the parameter but never sees the key, so it stays out of Terraform's state. Do the same again whenever you rotate the key.

### Deploying a new version

Run:

```bash
scripts/deploy.sh
```

The script:

1. Shows which AWS identity it's using, and refuses the root user. Set `CRANNY_ALLOW_ROOT=1` if you really need to deploy as root.
2. Installs from the lockfile, then runs lint, typecheck and tests, and builds.
3. Uploads the rooms API's Lambda code and waits for it to be ready.
4. Uploads the hashed files in `assets/` first, cached for a year, then `index.html` with `no-cache`, so a new version appears straight away.
5. Clears CloudFront's cache.

Check the release with:

```bash
curl -sI https://cranny.cooke.ing/g/1XDWT5H   # expect 200, no-cache, and the security headers
curl -s -X POST https://cranny.cooke.ing/api/rooms/join \
  -d '{"room":"no-such-room","self":"aaaaaaaaaaaaaaaaaaaaaa"}'   # expect {"error":"not-found"}
```

### Changing the infrastructure

- **Terraform:** edit `infra/*.tf`, then `terraform -chdir=infra plan` and `apply`.
- **Security headers:** these (CSP, HSTS, nosniff, Referrer-Policy) live in [`apps/web/security-headers.json`](apps/web/security-headers.json). Both CloudFront and `pnpm preview` read that file, so you can test a policy change locally against the production build before applying it. The plan fails if the file gains a header that CloudFront isn't set up to send.
