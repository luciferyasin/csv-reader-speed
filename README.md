# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/luciferyasin/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/luciferyasin/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in replacement for csv-reader 1.0.0. `solve.js` is a dependency-free ES module whose `run(input)`
returns exactly csv-reader's reading of `{text, header}` — `{columns, rows, errors}` — under csv-reader's
broken-row policy (BOM dropped, stray CRs, quote junk, unterminated quotes, short/long rows), verified identical
to the reference on the kit's practice set and on 20,000 randomised edge-case inputs. Instead of reading one
character at a time, it searches delimiters with `indexOf` behind forward-only position caches and builds fields
from string slices, so the text is scanned a constant number of times. On the practice set (6 cases, 10,193,953
characters) it took 72–79 ms of CPU against csv-reader 1.0.0's 595–736 ms in local runs (median of 9 rounds,
`--no-incremental-marking`), about 7.5–10× faster. `main.ts` is the standard driver: it reads every case from
`/input/cases.json` and writes `/output/answers.json`.

## Run it

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=21g0x4j8&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
