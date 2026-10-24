# Changelog

All notable changes to this package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-10-25

### Added

- `PricingOption.code`: a stable option code (`OptionCode`, currently `HEATED_FLOOR`) or `null`.
- `RoomConfiguration.name`: an optional room name chosen by the user, 1–60 characters after trimming.

### Fixed

- An option with an empty `roomTypeCodes` list now applies to rooms of every type instead of producing a zero quantity and `OPTION_ROOM_TYPE_NOT_ALLOWED` warnings.

## [0.1.0] - 2026-10-21

Initial release.

### Added

- `estimate` builds a renovation cost estimate from a configuration and a pricing data snapshot: base cost, object-level rules, per-room material lines, engineering package and options, additional options, section totals and the grand total.
- `checkLimits` validates a configuration against the pricing limits (total area, balcony area, room count, room sides and height, option quantities).
- Formula language with a safe expression parser: `parse`, `evaluate` and `validateFormula`. Only a whitelist of variables, `coef.*` coefficients and five functions is allowed; there is no `eval`. Parsing is bounded by length, depth and node count.
- `validateFormula` reports errors with positions, type checks and nearest-name suggestions, and returns the coefficient keys a formula uses.
- `previewRule` evaluates a rule against a sample object, room and product and returns the quantity, the amount and the values it used.
- Money helpers `toCents` and `convertCentsToKopecks`: integer USD cents, UAH kopecks by exchange rate with exact integer arithmetic.
- Warnings for incompatible combinations: a product that does not suit a heated floor, an option applied to a room type it does not support, rooms area exceeding the total area, and a missing exchange rate for UAH estimates.
- Zod schemas and inferred types for configuration, pricing data, estimate and rule preview. `zod` ^4 is a peer dependency.
- ESM and CommonJS builds with type declarations.
