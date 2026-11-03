# @roomwise/calc-engine

The calculation engine behind Roomwise, a step-by-step renovation cost configurator. It turns a configuration (apartment, rooms, chosen materials, options) and a snapshot of pricing data into an itemised estimate.

Rates, coefficients and formulas are plain data. Formulas are strings evaluated by a small purpose-built expression parser that only knows a fixed set of variables, coefficients and functions. There is no `eval` and no access to the JavaScript runtime. The same package computes live drafts in the browser and the authoritative result on the server, so both always agree.

## Installation

```sh
npm install @roomwise/calc-engine zod
```

`zod` `^4.0.0` is a peer dependency. The package ships ESM and CommonJS builds with types.

## Usage

```ts
import {
  ConfigurationSchema,
  PricingDataSchema,
  checkLimits,
  estimate,
} from '@roomwise/calc-engine';

const configuration = ConfigurationSchema.parse(configurationJson);
const data = PricingDataSchema.parse(pricingJson);

const violations = checkLimits(configuration, data.limits, data.options);
if (violations.length > 0) {
  // [{ field: 'rooms[0].heightM', min: 2.2, max: 5 }]
}

const result = estimate(configuration, data);
result.totals.usdCents; // integer cents
result.totals.uahKopecks; // null when there is no exchange rate
result.incomplete; // true if any line failed or could not be calculated
```

## API

### `estimate(configuration, data): Estimate`

Computes the estimate. It does not validate its input; parse with the schemas and call `checkLimits` first.

Lines are produced in this order: base cost, object rules (by `sortOrder`), materials (per room, per selected product), engineering (package items, then selected options), additional options. What each part produces depends on the renovation [scope](#renovation-scope).

- Base cost: `OBJECT` rules with `baseComponent: true`, one `BASE` line each. Only in `FULL`; a line that is `OK` with a zero amount is left out.
- Object rules: the other `OBJECT` level rules, one line each.
- Materials: for every room selection with a product, the `MATERIAL_TYPE` rule for the category and the product's material type is used if one exists, otherwise the `CATEGORY` rule. Without either, the line is `NOT_CALCULATED` (`RULE_NOT_FOUND`). Unknown or unavailable products give `UNAVAILABLE`. Each line carries [components](#line-components).
- Engineering and additional: package items marked `includedInBase` become `INCLUDED` lines with a zero amount, and are skipped in `PARTIAL`. Options are priced by unit (`PIECE`, `ROOM_SQM`, `ROOM`, `PROJECT`). An option has exactly one price source: `priceCents` with no `priceCoefficientKeys`, or `priceCents: null` with keys, in which case the unit price is the sum of those coefficients in dollars (`PricingDataSchema` rejects both and neither; read the price from the line's `unitPriceCents`). A missing coefficient gives an `ERROR` line (`UNKNOWN_COEFFICIENT`). An option whose `scopes` do not include the configuration scope is `UNAVAILABLE` with `OPTION_SCOPE_NOT_ALLOWED`.

Result fields:

| Field | Meaning |
| --- | --- |
| `pricingVersion` | `data.version` |
| `currency` | the currency requested in the configuration |
| `exchangeRate` | `data.exchangeRate` as given |
| `lines` | `EstimateLine[]` with `id`, `section`, `status`, quantity, unit price, `amountCents`, `amountUahKopecks`, `components`, `warnings`, `error` |
| `totals` | `{ usdCents, uahKopecks, sections }`, sums of the line amounts |
| `warnings` | all line warnings (with `lineId`) plus estimate-level ones |
| `incomplete` | `true` if any line has status `ERROR` or `NOT_CALCULATED` |

Line statuses: `OK`, `INCLUDED`, `NOT_CALCULATED`, `UNAVAILABLE`, `ERROR`. A failed line contributes `0` to the totals and carries an `error` of the form `{ code, params? }`.

Warning codes:

- `HEATED_FLOOR_INCOMPATIBLE`: a floor product that does not suit a heated floor.
- `OPTION_ROOM_TYPE_NOT_ALLOWED`: an option applied to a room type it does not support; that room is left out of the quantity.
- `ROOMS_AREA_EXCEEDS_TOTAL`: the rooms add up to more than the total area. `FULL` only.
- `ROOMS_AREA_BELOW_TOTAL`: the rooms add up to less than the total area by more than `limits.missingAreaHintSqm`; `params: { missingSqm }`. `FULL` only.
- `LABOR_RATE_MISSING`: a `PARTIAL` material line whose rule has no `laborFormula`; the labor component is 0.
- `EXCHANGE_RATE_UNAVAILABLE`: UAH requested but the pricing data has no rate.

### `checkLimits(configuration, limits, options?): LimitViolation[]`

Returns `{ field, min, max }` for every value outside its range. Checked fields: `totalAreaSqm` (`FULL` only), `balconyAreaSqm` (0 to the total area, or to `limits.totalAreaSqm.max` in `PARTIAL`), `rooms` (count), `rooms[i].lengthM`, `rooms[i].widthM`, `rooms[i].heightM`, and `options[i].quantity` for `PIECE` options (`minQuantity` defaults to 1, `maxQuantity` to unbounded). Pass `data.options` to enable the last check.

```ts
const violations = checkLimits(configuration, data.limits, data.options);
```

### `validateFormula(input): ValidateFormulaResult`

Statically checks a formula for a given rule level. Meant for admin editing.

```ts
import { validateFormula } from '@roomwise/calc-engine';

validateFormula({
  level: 'CATEGORY',
  kind: 'cost',
  source: 'quantity * (price + coef.underlay)',
  coefficientKeys: ['underlay', 'tile_glue'],
});
// { valid: true, coefficientKeys: ['underlay'], errors: [] }

validateFormula({
  level: 'OBJECT',
  kind: 'cost',
  source: 'totlArea * coef.rate',
  coefficientKeys: ['rate'],
});
// valid: false
// errors: [{ code: 'UNKNOWN_VARIABLE', position: 0, length: 8,
//            params: { name: 'totlArea', suggestion: 'totalArea' } }]
```

- `level`: `'OBJECT' | 'CATEGORY' | 'MATERIAL_TYPE' | 'SURFACE'`.
- `kind`: `'quantity'`, `'cost'` or `'labor'`. Only cost and labor formulas of `CATEGORY` and `MATERIAL_TYPE` rules may use `quantity`.
- `coefficientKeys`: the coefficient keys that exist; `coef.x` with another key is an error.
- The result's `coefficientKeys` lists the coefficients the formula references.
- Errors carry `code`, `position`, `length` (a span in the source) and optional `params`.
- The formula must type-check to a number.

### `previewRule(input): RulePreview`

Evaluates a rule against a sample, without any pricing data. It does not throw; failures are reported in `error`.

```ts
import { previewRule } from '@roomwise/calc-engine';

const preview = previewRule({
  level: 'CATEGORY',
  quantityFormula: 'floorArea * (1 + waste)',
  costFormula: 'quantity * (price + coef.underlay)',
  coefficients: { underlay: 2 },
  sample: {
    room: {
      roomTypeCode: 'LIVING_ROOM',
      lengthM: 5,
      widthM: 4,
      heightM: 2.7,
      heatedFloor: false,
    },
    product: { priceCents: 1800, unit: 'SQM', wastePercent: 5 },
    object: {
      scope: 'FULL',
      totalAreaSqm: 62,
      balconyAreaSqm: 4,
      balconyTiles: true,
      finishLevel: 'PRE_FINISH',
      roomsCount: 1,
      bathroomsCount: 1,
      roomsFloorArea: 20,
      roomsWallArea: 48.6,
      roomsPerimeter: 18,
      wetRoomsCount: 0,
    },
  },
});
// {
//   quantity: 21,
//   amountCents: 42000,
//   laborCents: null,
//   variables: { floorArea: 20, waste: 0.05, price: 18, quantity: 21 },
//   coefficients: { underlay: 2 },
//   error: null,
// }
```

`variables` and `coefficients` in the result contain only what the formulas reference. For `OBJECT` rules `quantityFormula` must be `null` and `room`/`product` may be omitted. For `SURFACE` rules `quantityFormula` must be `null`, and `sample.room` and `sample.surfaceArea` are required. For `CATEGORY` and `MATERIAL_TYPE` rules `quantityFormula`, `room` and `product` are required. Otherwise `error.code` is `QUANTITY_FORMULA_MISMATCH` or `SAMPLE_INCOMPLETE` (`params.missing` names the absent part, for example `surfaceArea`). `laborFormula` is optional and is evaluated for `CATEGORY` and `MATERIAL_TYPE` rules with the same variables as the cost formula, including `quantity`. Its amount is `laborCents`, which is `null` without a labor formula or when it fails; a labor failure is reported in `error` and `amountCents` keeps the material cost. In a `PARTIAL` sample `totalArea` is `roomsFloorArea`, as in `estimate`, and `sample.object.totalAreaSqm` is required in `FULL` and must be `null` in `PARTIAL`.

### Lower-level formula API

- `parse(source)` returns `{ ok: true, ast }` or `{ ok: false, error }`; `FORMULA_LIMITS` holds the limits.
- `evaluate(ast, { variables, coefficients })` returns `{ ok: true, value }` or `{ ok: false, error }`.
- `FORMULA_VARIABLES`, `FORMULA_SCOPE_VARIABLES`, `FORMULA_QUANTITY_VARIABLE`, `FORMULA_FUNCTIONS`, `FORMULA_FUNCTION_TABLE`, `COEFFICIENT_NAMESPACE`.
- `suggestNearest(name, candidates, maxDistance = 2)` and `levenshtein(a, b)`.
- Types such as `FormulaNode`, `FormulaError`, `FormulaErrorCode`, `EvaluationError`, `FormulaValue`.

### Variables and money helpers

- `objectVariables(configuration)`, `roomVariables(room)`, `productVariables(product, category)` and `productVariablesOf(product, wastePercent)` build the variable scopes `estimate` uses.
- `toCents(dollars)` and `convertCentsToKopecks(cents, rate)`; see [Rounding and currency](#rounding-and-currency).

### Schemas and types

Every schema is a zod schema with an inferred type of the same name without the `Schema` suffix.

- Configuration: `ConfigurationSchema`, `RoomConfigurationSchema`, `RoomSelectionSchema`, `OptionSelectionSchema`. `totalAreaSqm` is required in `FULL` and must be `null` in `PARTIAL`. Duplicate room `clientId`s, category ids within a room and option ids are rejected.
- Pricing data: `PricingDataSchema`, `PricingLimitsSchema`, `PricingRuleSchema`, `PricingRoomTypeSchema`, `PricingCategorySchema`, `PricingMaterialTypeSchema`, `PricingProductSchema`, `PricingPackageItemSchema`, `PricingOptionSchema`, `ExchangeRateSchema`.
- Result: `EstimateSchema`, `EstimateLineSchema`, `LineComponentSchema`, `EstimateTotalsSchema`, `SectionTotalSchema`, `EstimateWarningSchema`, `EstimateMessageSchema`.
- Preview: `RuleSampleSchema`, `RulePreviewSchema`.
- Enums and primitives: `ScopeSchema`, `LineComponentKindSchema`, `FinishLevelSchema`, `RuleLevelSchema`, `RateSourceSchema`, `SurfaceKindSchema`, `ProductUnitSchema`, `OptionUnitSchema`, `OptionKindSchema`, `RoomTypeCodeSchema`, `CurrencySchema`, `SectionSchema`, `LineStatusSchema`, `LocalizedTextSchema`, `CentsSchema`, `RangeSchema`.

## Renovation scope

`Configuration.scope` selects what is estimated. It defaults to `FULL`, so configurations saved before the field existed still parse.

| | `FULL` | `PARTIAL` |
| --- | --- | --- |
| `totalAreaSqm` | required | `null` |
| `BASE` section | `OBJECT` rules with `baseComponent: true`, one line each | none |
| Material lines | `MATERIAL` component only | `MATERIAL`, `LABOR` and `PREP` components |
| Package items with `includedInBase` | `INCLUDED` lines | skipped |
| `totalArea` variable | `totalAreaSqm` | `roomsFloorArea` |
| Area warnings | `ROOMS_AREA_EXCEEDS_TOTAL`, `ROOMS_AREA_BELOW_TOTAL` | none |

The base cost has no per-area rate table. It is built from rules whose formulas use the volumes of the rooms (`roomsFloorArea`, `roomsWallArea`, `roomsPerimeter`, `wetRoomsCount`) together with `finishLevel`, `scope` and coefficients.

### Line components

A material line is the sum of its components:

- `MATERIAL`: the rule's `costFormula`.
- `LABOR`: the rule's `laborFormula`, which only `CATEGORY` and `MATERIAL_TYPE` rules can have. It is evaluated in `PARTIAL` only. Without a formula the component is 0 and the line gets `LABOR_RATE_MISSING`.
- `PREP`: surface preparation, from a `SURFACE` rule.

Every component is rounded to whole cents on its own and `amountCents` is the sum of the rounded components. A `FULL` line has a single `MATERIAL` component. Each component carries the `ruleId` of the rule that produced it; ids are plain strings.

### Surface preparation

A `SURFACE` rule prices the preparation of one surface: `FLOOR`, `WALLS` or `CEILING`. It has a `surface` and no `categoryId` or quantity formula. A category belongs to a surface through `PricingCategory.surface`.

In `PARTIAL`, for every room the engine collects the surfaces of the categories with a selected product and evaluates the surface rule once per room and surface, with `surfaceArea` equal to `floorArea` for floor and ceiling and `wallArea` for walls. The result becomes the `PREP` component of the first category on that surface, in the order of the room's `selections`. The other categories on the same surface get a `PREP` component of 0 with `sharedWithCategoryId` pointing at that first category, so the preparation is never counted twice. A surface without a rule gets no `PREP`. If the surface formula fails, every line on that surface fails with that error.

## Formula language

A formula is a single expression that produces a non-negative number. Each rule has a cost formula; material rules (`CATEGORY`, `MATERIAL_TYPE`) also have a quantity formula, evaluated first, and an optional labor formula. Formulas are written in dollars; the engine converts the result to cents.

```
floorArea * (1 + waste)
quantity * (price + (heatedFloor ? coef.tile_glue_heated : coef.tile_glue))
balconyTiles ? balconyArea * coef.balcony_tile : 0
max(wallArea - 4, 0) * coef.paint
roomType == 'KITCHEN' ? ceil(floorArea / 2) : 0
```

### Variables

| Scope | Variable | Type |
| --- | --- | --- |
| room | `length`, `width`, `height` | number, meters |
| room | `floorArea`, `perimeter`, `wallArea` | number: `length * width`, `2 * (length + width)`, `perimeter * height` |
| room | `heatedFloor` | boolean |
| room | `roomType` | `LIVING_ROOM`, `BEDROOM`, `KITCHEN`, `KITCHEN_LIVING`, `BATHROOM`, `HALLWAY`, `STORAGE` |
| product | `price` | number, dollars per unit |
| product | `waste` | number, a fraction (5% is `0.05`): the product override, else the category value |
| product | `unit` | `SQM`, `LINEAR_M`, `PIECE` |
| object | `totalArea`, `balconyArea` | number; `totalArea` is `roomsFloorArea` in `PARTIAL` |
| object | `scope` | `FULL`, `PARTIAL` |
| object | `roomsFloorArea`, `roomsWallArea`, `roomsPerimeter` | number: sums over all rooms of `floorArea`, `wallArea` and `perimeter` |
| object | `wetRoomsCount` | number (bathrooms, kitchens and kitchen-living rooms) |
| object | `balconyTiles` | boolean |
| object | `finishLevel` | `ROUGH`, `PRE_FINISH`, `LIVED_IN` |
| object | `roomsCount`, `bathroomsCount` | number (living rooms, bedrooms and kitchen-living rooms count as rooms) |
| `SURFACE` rules only | `surfaceArea` | number: the area of the surface being prepared |
| `SURFACE` rules only | `puttyRequired` | boolean: `true` when at least one category selected on the surface has `requiresPutty` (default `true`); booleans do not coerce, write `puttyRequired ? a : 0` |
| cost and labor formulas of `CATEGORY` and `MATERIAL_TYPE` rules | `quantity` | the result of the quantity formula |

Availability by rule level:

- `OBJECT`: object variables only. `quantity` is not available.
- `CATEGORY` and `MATERIAL_TYPE`: room, product and object variables. `quantity` is available in cost and labor formulas, not in the quantity formula. `laborFormula` sees the same variables as `costFormula`.
- `SURFACE`: room and object variables plus `surfaceArea` and `puttyRequired`. `quantity` and the product variables are not available.

Coefficients are read as `coef.<key>`; keys come from the pricing data. The cost and labor formulas receive `quantity` unrounded, while the line shows it rounded to 3 decimals.

### Syntax

- Numbers and booleans (`true`, `false`). String literals are allowed only when comparing an enum variable.
- Arithmetic: `+ - * /` and unary `-`. Comparison: `< > <= >= == !=`. Logic: `&& || !`. Ternary: `test ? a : b`. Parentheses.
- `==` and `!=` work between an enum variable and a string literal (`roomType == 'BATHROOM'`), or between two values of the same type. The literal must be a valid value of that variable.
- Functions: `min(a, b, ...)` and `max(a, b, ...)` (one or more arguments), `round(x)`, `ceil(x)`, `floor(x)`. `round` rounds halves up.
- Anything else is a syntax error: `%`, `**`, bitwise operators, `null`, `in`, `instanceof`, unary `+`, indexing (`a[0]`), semicolons and sequences, method calls, other `Math` functions.

### Limits

| Limit | Value |
| --- | --- |
| Source length | 500 characters |
| AST depth | 32 |
| AST nodes | 200 |

### Errors from `validateFormula`

| Code | When |
| --- | --- |
| `FORMULA_SYNTAX` | Not parsable, empty, or a type error. `params.detail` for parser failures; `params.reason` is `TYPE_MISMATCH` (with `expected`), `ARGUMENT_COUNT` (`min`, `max`) or `UNKNOWN_ENUM_VALUE` (`value`, `variable`) |
| `FORMULA_TOO_COMPLEX` | Over a limit; `params: { limit: 'LENGTH' \| 'DEPTH' \| 'NODES', max }` |
| `UNKNOWN_VARIABLE` | Name is not a variable; `params.suggestion` holds the nearest valid name when one is within edit distance 2 |
| `VARIABLE_NOT_ALLOWED_AT_LEVEL` | A real variable used on a level that does not provide it, such as `price` in an `OBJECT` rule; `params: { variable, level }` |
| `UNKNOWN_COEFFICIENT` | `coef.x` with `x` not in `coefficientKeys`; `params: { key }` |
| `UNKNOWN_FUNCTION` | Unknown function name; `params: { name }` |
| `QUANTITY_NOT_ALLOWED` | `quantity` in a quantity formula or in an `OBJECT` or `SURFACE` rule |

Rejected examples:

```
floorArea ** 2               FORMULA_SYNTAX
sqrt(floorArea)              UNKNOWN_FUNCTION
price * qty                  UNKNOWN_VARIABLE
price * totalArea            VARIABLE_NOT_ALLOWED_AT_LEVEL (OBJECT level)
quantity * price             QUANTITY_NOT_ALLOWED (in a quantity formula)
roomType == 'GARAGE'         FORMULA_SYNTAX (UNKNOWN_ENUM_VALUE)
heatedFloor + 1              FORMULA_SYNTAX (TYPE_MISMATCH)
roomType                     FORMULA_SYNTAX (TYPE_MISMATCH: the result must be a number)
```

### Runtime errors

Static validation does not catch everything. At evaluation time a line fails with `FORMULA_RUNTIME_ERROR` and `params.reason` set to `DIVISION_BY_ZERO`, `NOT_FINITE`, `TYPE_MISMATCH` or `NEGATIVE` (a rule result must not be negative). A line above 10,000,000,000 cents fails with `AMOUNT_OUT_OF_RANGE`.

## Rounding and currency

All money is integer cents (USD) or kopecks (UAH); amounts in the output are never floating point.

- Each estimate line is rounded to whole cents with `toCents`: `Math.round(Number((dollars * 100).toPrecision(15)))`. The `toPrecision(15)` step removes binary noise, so `1.005` becomes 101 cents rather than 100. Halves round up. Negative or non-finite values throw `RangeError`.
- Section totals and the grand total are the sum of the rounded lines. Nothing is rounded again at the total level.
- UAH: each line is converted on its own with `convertCentsToKopecks(cents, rate)`, and the UAH totals are the sums of those kopeck amounts. The rate is a string with up to four decimals (the pricing data format is `"41.2500"`), handled as a scaled integer with `BigInt`, so the result is exact with halves rounded up. An invalid rate throws `RangeError`.
- With no exchange rate, `amountUahKopecks` and `uahKopecks` are `null`; if the configuration asks for UAH, the estimate also carries the `EXCHANGE_RATE_UNAVAILABLE` warning.
- The quantity shown on a line is rounded to 3 decimals; formulas use the unrounded value.

```ts
import { convertCentsToKopecks, toCents } from '@roomwise/calc-engine';

toCents(1.005); // 101
convertCentsToKopecks(10_000, '41.2500'); // 412_500
```

## Versioning and releases

The package follows semver. A release is published to npm by GitHub Actions from a tag named `calc-engine@X.Y.Z`, for example `calc-engine@0.1.0`. The tag must point to a commit on `main`, and its version must match `version` in `package.json`; both are updated together with [CHANGELOG.md](./CHANGELOG.md) in the pull request that prepares the release. Only stable `X.Y.Z` versions are published. The workflow lints, typechecks, tests and builds the package before publishing it with provenance. It authenticates with the `NPM_TOKEN` secret until the repository variable `NPM_TRUSTED_PUBLISHING` is set to `true`; from then on it uses npm trusted publishing and the token can be revoked.

## License

[MIT](./LICENSE)
