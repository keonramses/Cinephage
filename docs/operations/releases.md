# Releases

Cinephage uses a two-channel release model:

- `latest` - current stable release from `main`
- `dev` - current preview build from `dev`
- `vX.Y.Z` - pinned stable release tag

Internal CI also publishes immutable candidate tags for traceability:

- `main-YYYYMMDD-RUN`
- `dev-YYYYMMDD-RUN`

These candidate tags are operational artifacts and are not part of the public deployment contract.

---

## Branch Roles

- `main` - stable branch, used for production releases
- `dev` - preview branch, used for ongoing integration and testing

Recommended flow:

1. Feature and fix branches target `dev`
2. `dev` is promoted into `main` when you want a stable release
3. Emergency hotfixes may target `main`, then must be merged back into `dev`

---

## Docker Tags

### Stable

- `ghcr.io/moldytaint/cinephage:latest`
- `ghcr.io/moldytaint/cinephage:vX.Y.Z`

Use `latest` if you want the current stable release.
Use `vX.Y.Z` if you want deterministic, pinned deployments.

### Preview

- `ghcr.io/moldytaint/cinephage:dev`

Use `dev` only if you want preview builds from the `dev` branch.

---

## Release Process

### Preview builds

Every push to `dev` publishes:

- floating preview tag: `dev`
- immutable preview candidate: `dev-YYYYMMDD-RUN`

Preview builds do not create GitHub Releases.

### Stable releases

Stable releases are created manually from `main` by promoting an immutable `main-YYYYMMDD-RUN` candidate.

That promotion creates:

- Git tag `vX.Y.Z`
- GitHub Release `vX.Y.Z`
- image tag `vX.Y.Z`
- image tag `latest`

---

## Rollback Policy

- `latest` always points to a stable release
- rollback is done by repointing `latest` to an earlier stable `vX.Y.Z`
- Cinephage does not support forcing `latest` to a preview build

If you need a non-stable build, use `dev` explicitly.

---

## Version Reporting

The running application reports the deployed build/release version from runtime environment metadata.

In practice:

- Docker stable releases report `vX.Y.Z`
- Docker preview builds report `dev`, `main-YYYYMMDD-RUN`, or `dev-YYYYMMDD-RUN` as appropriate
- local/manual development falls back to `dev-local`
