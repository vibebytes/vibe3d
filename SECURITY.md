# Security Policy

## Supported versions

Security fixes are applied on the latest `main` release line (`0.2.x` and newer).

## Local daemon defaults

The daemon binds to `127.0.0.1` / `localhost` only. Authentication is optional:

- Local single-user MCP setups may omit `VIBE3D_TOKEN`.
- Any shared machine, multi-user host, or exposure beyond loopback **must** set a strong `VIBE3D_TOKEN` (via environment variable, not CLI args).

Do not reverse-proxy the daemon to the public internet without auth and your own TLS termination.

## Reporting a vulnerability

Please open a [GitHub security advisory](https://github.com/vibebytes/vibe3d/security/advisories/new) if the repository has advisories enabled, or email the maintainers listed in the GitHub org profile.

Include:

1. Affected version / commit
2. Reproduction steps
3. Impact (RCE, local file read, auth bypass, etc.)

We will acknowledge reports as soon as practical and coordinate a fix before public disclosure when appropriate.
