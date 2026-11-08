# Gallery at Home: notes for coding agents

See README.md for how the app is built, tested and deployed.

## Versioning

Follow [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

- **PATCH** for fixes that change no behaviour a user would rely on.
- **MINOR** for new features or changed behaviour that stays compatible with
  saved data and settings.
- **MAJOR** for changes that break compatibility, such as saved data that an
  older version can't read, or a feature removed.

Bump the version in the same commit as the change, with
`npm version <patch|minor|major> --no-git-tag-version` (it updates
`package.json` and `package-lock.json`; `tizen/config.xml` takes it from
there at build time). Changes to docs, tests or tooling alone don't need a
bump.

Samsung's store also requires every upload to have a higher version than the
last, with each part in range: `[0-255].[0-255].[0-65535]`.

## Commits

Don't add `Co-Authored-By` (or any other AI attribution) trailers to commit
messages or pull requests. Commits are authored by the repository owner only.
