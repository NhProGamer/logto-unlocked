# Logto Unlocked

**Logto Unlocked is a fork of [Logto](https://github.com/logto-io/logto) that enables Cloud features for the OSS version.**

> **Note**: This is not the official Logto project. For the official version, please visit [github.com/logto-io/logto](https://github.com/logto-io/logto).

## Unlocked Features

### Bring Your UI (BYUI)
- Full customization of the authentication interface
- **S3 storage support** (in addition to Azure)

### Hide Logto Branding
- Ability to hide Logto branding from the sign-in experience

## Installation

Follow the same installation steps as the official Logto OSS:

```bash
# Using Docker Compose (requires Docker Desktop)
docker compose -p logto -f docker-compose.yml up

# Using Node.js (requires PostgreSQL)
pnpm install && pnpm start
```

For detailed instructions, refer to the [official Logto documentation](https://docs.logto.io/logto-oss/get-started-with-oss).

## Credits

This project is a fork of [Logto](https://github.com/logto-io/logto).
All credit goes to the Logto team for their excellent work on the original project.

## License

[MPL-2.0](LICENSE)
