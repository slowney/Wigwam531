// Prints a planned week for the given TMs, to check against the nSuns app:
//
//   npm run week -- bench=225 squat=275 ohp=135 deadlift=315
//   npm run week -- bench=225 squat=275 ohp=135 deadlift=315 row=135 deload
//
// `row=` switches to the heavy-row preset with that working weight. Add
// `deload` or `tmTest` for those week types. Node runs the engine's
// TypeScript directly by stripping types, so there's no build step.
import { planWeek } from '../src/engine/plan.ts'
import { weekReport } from '../src/engine/render.ts'
import { gymChecks } from '../src/engine/weights.ts'
import { findExercise } from '../src/data/exercises.ts'
import { HOME_GYM } from '../src/data/gym.ts'
import { NSUNS_4DAY, NSUNS_4DAY_ROW } from '../src/data/presets.ts'
import { findScheme } from '../src/data/schemes.ts'

const ALIASES = { bench: 'bench-press', ohp: 'overhead-press', row: 'barbell-row' }

const tms = {}
const workingWeights = {}
let weekType = 'normal'

for (const arg of process.argv.slice(2)) {
  if (arg === 'deload' || arg === 'tmTest') {
    weekType = arg
    continue
  }
  const [key, value] = arg.split('=')
  const id = ALIASES[key] ?? key
  const lb = Number(value)
  if (!findExercise(id) || !Number.isFinite(lb)) {
    console.error(`Don't understand "${arg}". Use bench=, squat=, ohp=, deadlift=, row=.`)
    process.exit(1)
  }
  if (id === 'barbell-row') workingWeights[id] = lb
  else tms[id] = lb
}

const program = workingWeights['barbell-row'] === undefined ? NSUNS_4DAY : NSUNS_4DAY_ROW
const days = planWeek(program, {
  weekType,
  tms,
  workingWeights,
  schemes: findScheme,
  ...gymChecks(HOME_GYM, findExercise),
})
process.stdout.write(weekReport({ program, weekType, tms, days, lookup: findExercise }))
