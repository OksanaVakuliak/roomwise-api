# Changelog

All notable changes to this package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-11-03

### Added

- `PricingCategory.requiresPutty`: whether the category needs a puttied base, default `true`, so pricing data without it still parses.
- The `puttyRequired` variable for `SURFACE` rules (`FORMULA_PUTTY_REQUIRED_VARIABLE`): `true` when at least one category selected on the surface has `requiresPutty`, `false` when none does. It is a boolean, so use `puttyRequired ? a : 0`; it does not coerce to a number. It is derived from the room's selections, not from line status, so an unavailable product does not remove putty.
- The `roomsPuttyWallArea` object variable: wall area of the rooms whose wall selections need putty; rooms without wall selections count. Also `RuleSample.object.roomsPuttyWallArea` for previews, defaulting to `roomsWallArea`. `objectVariables` now takes the pricing categories as a second argument.
- `findOptionPriceSourceViolation`: the single check of the option price source rule, used by `PricingOptionSchema`.
- `RuleSample.puttyRequired` for `SURFACE` previews, `true` when omitted.

### Changed

- `PricingOption.priceCents` is nullable. An option has exactly one price source: a number with no `priceCoefficientKeys`, or `null` with at least one key. `PricingDataSchema` rejects both and neither. Consumers must show the option price from the computed line (`unitPriceCents`), not from `priceCents`.

## [0.5.0] - 2026-11-02

### Added

- `Configuration.scope`: `FULL` or `PARTIAL` (`ScopeSchema`, `Scope`), default `FULL`, so configurations and snapshots without it still parse as a full renovation. The `scope` object variable is available to rules of every level.
- `LIVED_IN` finish level and `HALLWAY`, `STORAGE` room types. `roomsCount` is unchanged by the new room types.
- `SURFACE` rule level with a `surface` field (`FLOOR`, `WALLS`, `CEILING`). A surface rule is evaluated once per room and surface in `PARTIAL` estimates. It has no `categoryId` and no quantity formula, and sees the room and object variables plus `surfaceArea`.
- `PricingRule.laborFormula`: an optional labor cost formula on `CATEGORY` and `MATERIAL_TYPE` rules, evaluated in `PARTIAL` estimates only. A missing formula gives a zero labor component and the `LABOR_RATE_MISSING` warning.
- `PricingRule.baseComponent`: marks an `OBJECT` rule as part of the base cost.
- `EstimateLine.components` (`LineComponentSchema`, `LineComponentKindSchema`): `MATERIAL`, `LABOR` and `PREP` components with `ruleId`, `amountCents` and an optional `sharedWithCategoryId`. Both ids are plain strings like other ids, not uuids.
- Object variables `scope`, `roomsFloorArea`, `roomsWallArea`, `roomsPerimeter` and `wetRoomsCount` (bathrooms, kitchens and kitchen-living rooms), and the `surfaceArea` variable for `SURFACE` rules (`FORMULA_SURFACE_AREA_VARIABLE`).
- `FormulaKind` value `labor` for `validateFormula`, and `SURFACE` as a rule level there and in `previewRule`. `RuleSample.surfaceArea` is required for `SURFACE` previews.
- `PricingLimits.missingAreaHintSqm`: the threshold for the new `ROOMS_AREA_BELOW_TOTAL` warning.
- `PricingOption.priceCoefficientKeys`: when not empty, the unit price is the sum of those coefficients in dollars instead of `priceCents`. A missing coefficient gives an `ERROR` line with `UNKNOWN_COEFFICIENT`.
- `PricingOption.scopes`: the renovation scopes an option is available in. An option outside the configuration scope is `UNAVAILABLE` with `OPTION_SCOPE_NOT_ALLOWED`.
- `previewRule` evaluates the optional `laborFormula` of `CATEGORY` and `MATERIAL_TYPE` rules and returns it as `RulePreview.laborCents` (`null` without a labor formula or on error). `totalAreaOf(scope, totalAreaSqm, roomsFloorArea)` is exported next to `objectVariables`.
- Codes `LABOR_RATE_MISSING`, `OPTION_SCOPE_NOT_ALLOWED` and `ROOMS_AREA_BELOW_TOTAL` (`{ missingSqm }`).

### Removed

- `PricingData.baseRates`, `BaseRateSchema` and the `BaseRate` type. The base cost now comes from rules.
- The `BASE_RATE_NOT_FOUND` code.

### Changed

- **Breaking:** `Configuration.totalAreaSqm` is nullable. It is required in `FULL` and must be `null` in `PARTIAL`.
- The `BASE` section is built from `OBJECT` rules with `baseComponent: true`, one line per rule. It is omitted in `PARTIAL`, and `OK` lines with a zero amount are left out. Other `OBJECT` rules stay in the `OBJECT` section.
- A material line amount is the sum of its components, each rounded to whole cents. `FULL` lines have a single `MATERIAL` component.
- In `PARTIAL`, package items with `includedInBase` are skipped, and `totalArea` equals `roomsFloorArea`.
- `checkLimits` checks `totalAreaSqm` in `FULL` only. In `PARTIAL` the balcony area is limited by `limits.totalAreaSqm.max`.
- `ROOMS_AREA_EXCEEDS_TOTAL` and `ROOMS_AREA_BELOW_TOTAL` are produced in `FULL` only.
- `RuleSampleSchema` requires the new object variables in `object`, and `object.totalAreaSqm` is nullable: required in `FULL`, `null` in `PARTIAL`. The preview `totalArea` follows the scope, as in `estimate`.
- A coefficient-based option price that is negative or above the line limit gives an `ERROR` line with `AMOUNT_OUT_OF_RANGE` and no unit price.
- `quantity` is available in `labor` formulas of `CATEGORY` and `MATERIAL_TYPE` rules, and is not allowed in `SURFACE` formulas.

## [0.4.0] - 2026-10-31

### Removed

- The `kitchenType` object parameter: it is no longer part of `Configuration` or the preview input, is no longer a formula variable, and `KitchenTypeSchema` and the `KitchenType` type are no longer exported. Inputs that still send `kitchenType` are accepted and the field is ignored.

## [0.3.0] - 2026-10-30

### Removed

- The `gas` object parameter: it is no longer part of `Configuration` or the preview input and is no longer a formula variable. Inputs that still send `gas` are accepted and the field is ignored.

## [0.2.0] - 2026-10-25

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
