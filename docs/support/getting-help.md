# Getting Help

Resources and guidelines for getting support with Cinephage.

---

## Self-Help Resources

Before asking for help, check these resources:

| Resource                                    | Use For                             |
| ------------------------------------------- | ----------------------------------- |
| [Troubleshooting Guide](troubleshooting.md) | Common issues and solutions         |
| [FAQ](faq.md)                               | Quick answers to frequent questions |
| [Documentation](../INDEX.md)                | Feature guides and configuration    |

---

## Community Support

### Discord

Join the Cinephage Discord for community chat and support:

**[discord.gg/scGCBTSWEt](https://discord.gg/scGCBTSWEt)**

Discord is best for:

- Quick questions
- General discussion
- Sharing tips and configurations
- Getting help from other users

### GitHub Discussions

For longer-form discussions and feature ideas:

**[GitHub Discussions](https://github.com/MoldyTaint/Cinephage/discussions)**

---

## Bug Reports

### When to File an Issue

File a GitHub issue for:

- Bugs that can be reproduced
- Crashes or errors
- Features not working as documented

Don't file issues for:

- General questions (use Discord)
- Feature requests without discussion
- Issues already reported

### How to Report a Bug

1. **Search existing issues** first: [GitHub Issues](https://github.com/MoldyTaint/Cinephage/issues)

2. **Create a new issue** if not found

3. **Include this information:**

```markdown
## Description

Clear explanation of the problem.

## Steps to Reproduce

1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior

What should happen.

## Actual Behavior

What actually happens.

## Environment

- OS: (Ubuntu 22.04, Windows 11, etc.)
- Node.js version: (output of `node --version`)
- Cinephage version: (from Settings, `/api/health`, or `/api/system/status`)
- Installation method: (Docker/Manual)

## Logs
```

Paste relevant log excerpts here.
Redact any sensitive information (API keys, paths with usernames, etc.)

```

```

### Log Collection

Include relevant logs when reporting issues:

```bash
# Recent errors
grep -i error logs/cinephage.log | tail -50

# Specific timeframe
grep "2025-01-08" logs/cinephage.log | tail -100

# Docker logs
docker logs cinephage --tail 100 2>&1

# Systemd logs
sudo journalctl -u cinephage -n 100
```

**Redact sensitive information:**

- API keys
- Usernames in file paths
- IP addresses (if relevant)
- Any personal information

---

## Feature Requests

For feature requests:

1. Check if it's already planned in the [Roadmap](../roadmap.md)
2. Search existing [GitHub Issues](https://github.com/MoldyTaint/Cinephage/issues) and [Discussions](https://github.com/MoldyTaint/Cinephage/discussions)
3. Start a discussion if not found
4. Describe the use case, not just the solution

---

## Security Issues

For security vulnerabilities:

**Do NOT** file a public GitHub issue.

Instead, follow the [Security Policy](../../SECURITY.md) for responsible disclosure.

---

## Contributing

Want to help improve Cinephage?

- [Contributing Guidelines](../../CONTRIBUTING.md)
- [Code of Conduct](../../CODE_OF_CONDUCT.md)

Contributions welcome:

- Bug fixes
- Documentation improvements
- New features (discuss first)
- Translations

---

## Response Times

Cinephage is maintained by a solo developer. Please be patient:

| Channel       | Typical Response |
| ------------- | ---------------- |
| Discord       | Hours to days    |
| GitHub Issues | Days to weeks    |
| Pull Requests | Days to weeks    |

The project is a passion project, not a commercial product. Your patience is appreciated.

---

**See also:** [Troubleshooting](troubleshooting.md) | [FAQ](faq.md) | [Documentation](../INDEX.md)
