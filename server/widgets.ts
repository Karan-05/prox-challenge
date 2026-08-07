import { specs } from "./knowledge.js";

export type DutyProcess = "MIG / Flux-Cored" | "TIG" | "Stick";
export type InputVoltage = "120V" | "240V";

export interface DutyCycleWidget {
  kind: "duty-cycle";
  title: string;
  process: DutyProcess;
  voltage: InputVoltage;
  amps: number;
  currentRange: { min: number; max: number };
  published: {
    ratedPercent: number;
    ratedAmps: number;
    continuousAmps: number;
  };
  matrix: Record<DutyProcess, Record<InputVoltage, {
    currentRange: { min: number; max: number };
    ratedPercent: number;
    ratedAmps: number;
    continuousAmps: number;
    page: number;
  }>>;
  result: {
    status: "continuous" | "exact" | "conservative" | "unsupported" | "out-of-range";
    percent: number | null;
    weldMinutes: number | null;
    restMinutes: number | null;
    label: string;
    explanation: string;
  };
  source: { label: string; page: number; href: string };
}

export interface ProcessSelectionWidget {
  kind: "process-selection";
  title: string;
  inputs: {
    material: "steel" | "stainless" | "aluminum" | "chrome-moly" | "cast-iron";
    gauge?: number;
    environment: "indoors" | "outdoors";
    priority: "easy" | "clean" | "penetration" | "precision";
  };
  recommendation: string;
  summary: string;
  processes: Array<{
    name: string;
    fit: "recommended" | "possible" | "not-suited";
    gas: string;
    thickness: string;
    reason: string;
  }>;
  source: { label: string; page: number; href: string };
}

export type WidgetData = DutyCycleWidget | ProcessSelectionWidget;

export function calculateDutyCycle(
  process: DutyProcess,
  voltage: InputVoltage,
  amps: number,
): DutyCycleWidget {
  const specKey = process === "MIG / Flux-Cored" ? "MIG" : process;
  const duty = specs.dutyCycle[specKey];
  const point = duty[voltage];
  const rangeText: string = specs.specifications[specKey].weldingCurrentRange[voltage];
  const [min, max] = [...rangeText.matchAll(/\d+/g)].map((match) => Number(match[0]));
  const roundedAmps = Math.round(amps * 10) / 10;

  let result: DutyCycleWidget["result"];
  if (roundedAmps < min || roundedAmps > max) {
    result = {
      status: "out-of-range",
      percent: null,
      weldMinutes: null,
      restMinutes: null,
      label: "Outside the machine's published current range",
      explanation: `The manual rates this mode for ${min}–${max}A on ${voltage}.`,
    };
  } else if (roundedAmps <= point.continuous100pct) {
    result = {
      status: "continuous",
      percent: 100,
      weldMinutes: 10,
      restMinutes: 0,
      label: "Continuous-use zone",
      explanation: `The manual publishes 100% duty cycle at ${point.continuous100pct}A; staying at or below it is the conservative published limit. Thermal protection and normal safety precautions still apply.`,
    };
  } else if (roundedAmps === point.rated.amps) {
    result = {
      status: "exact",
      percent: point.rated.percent,
      weldMinutes: point.rated.weldMinutes,
      restMinutes: point.rated.restMinutes,
      label: "Exact published rating",
      explanation: "This is an exact duty-cycle point printed in the owner’s manual.",
    };
  } else if (roundedAmps < point.rated.amps) {
    result = {
      status: "conservative",
      percent: point.rated.percent,
      weldMinutes: point.rated.weldMinutes,
      restMinutes: point.rated.restMinutes,
      label: "Conservative published limit",
      explanation: `The manual does not publish a curve between ${point.continuous100pct}A and ${point.rated.amps}A. Use the ${point.rated.percent}% rated limit rather than inventing an interpolated value.`,
    };
  } else {
    result = {
      status: "unsupported",
      percent: null,
      weldMinutes: null,
      restMinutes: null,
      label: "No published duty-cycle value",
      explanation: `The machine can be set above ${point.rated.amps}A, but the manual gives no duty-cycle duration there. Reduce current or stop well before the ${point.rated.percent}% rated interval.`,
    };
  }

  const page = specKey === "MIG" ? 19 : 29;
  const matrix = Object.fromEntries(
    (["MIG / Flux-Cored", "TIG", "Stick"] as DutyProcess[]).map((matrixProcess) => {
      const matrixKey = matrixProcess === "MIG / Flux-Cored" ? "MIG" : matrixProcess;
      return [
        matrixProcess,
        Object.fromEntries(
          (["120V", "240V"] as InputVoltage[]).map((matrixVoltage) => {
            const matrixPoint = specs.dutyCycle[matrixKey][matrixVoltage];
            const matrixRange: string = specs.specifications[matrixKey].weldingCurrentRange[matrixVoltage];
            const [matrixMin, matrixMax] = [...matrixRange.matchAll(/\d+/g)].map((match) => Number(match[0]));
            return [
              matrixVoltage,
              {
                currentRange: { min: matrixMin, max: matrixMax },
                ratedPercent: matrixPoint.rated.percent,
                ratedAmps: matrixPoint.rated.amps,
                continuousAmps: matrixPoint.continuous100pct,
                page: matrixKey === "MIG" ? 19 : 29,
              },
            ];
          }),
        ),
      ];
    }),
  ) as DutyCycleWidget["matrix"];
  return {
    kind: "duty-cycle",
    title: "Manual-grounded duty cycle",
    process,
    voltage,
    amps: roundedAmps,
    currentRange: { min, max },
    published: {
      ratedPercent: point.rated.percent,
      ratedAmps: point.rated.amps,
      continuousAmps: point.continuous100pct,
    },
    matrix,
    result,
    source: {
      label: `Owner’s manual p.${page}`,
      page,
      href: `/manual/pages/manual-${String(page).padStart(2, "0")}.png`,
    },
  };
}

const PROCESS_MATRIX = [
  {
    name: "MIG / GMAW",
    gas: "Required",
    thickness: "22 gauge to 3/8 in",
    materials: ["steel", "stainless", "aluminum"],
    outdoors: false,
    priorities: ["easy", "clean"],
    thinGauge: 22,
    thickGauge: 0,
  },
  {
    name: "Flux-Cored / FCAW",
    gas: "No gas",
    thickness: "18 gauge to 5/16 in",
    materials: ["steel", "stainless"],
    outdoors: true,
    priorities: ["easy", "penetration"],
    thinGauge: 18,
    thickGauge: 0,
  },
  {
    name: "Stick / SMAW",
    gas: "No gas",
    thickness: "10 gauge to 1/2 in",
    materials: ["steel", "stainless", "cast-iron"],
    outdoors: true,
    priorities: ["penetration"],
    thinGauge: 10,
    thickGauge: 0,
  },
  {
    name: "DC TIG / GTAW",
    gas: "Required",
    thickness: "24 gauge to 3/16 in",
    materials: ["steel", "stainless", "chrome-moly"],
    outdoors: false,
    priorities: ["clean", "precision"],
    thinGauge: 24,
    thickGauge: 6,
  },
] as const;

export function selectProcess(input: ProcessSelectionWidget["inputs"]): ProcessSelectionWidget {
  const ranked = PROCESS_MATRIX.map((process) => {
    const materialFit = process.materials.includes(input.material as never);
    const environmentFit = input.environment !== "outdoors" || process.outdoors;
    const thicknessFit =
      input.gauge === undefined || (input.gauge <= process.thinGauge && input.gauge >= process.thickGauge);
    const priorityFit = process.priorities.includes(input.priority as never);
    const score = Number(materialFit) * 4 + Number(environmentFit) * 2 + Number(thicknessFit) * 3 + Number(priorityFit) * 2;
    return { process, materialFit, environmentFit, thicknessFit, priorityFit, score };
  }).sort((a, b) => b.score - a.score);

  // Never recommend a process the fit columns themselves rule out — if nothing
  // passes every hard constraint, say so instead of picking the least-bad row.
  const suited = ranked.filter((entry) => entry.materialFit && entry.environmentFit && entry.thicknessFit);
  const best = suited[0] ?? null;
  const aluminumNote = input.material === "aluminum" ? " Aluminum requires the optional MIG spool gun; this machine cannot AC TIG aluminum." : "";
  return {
    kind: "process-selection",
    title: "Process decision card",
    inputs: input,
    recommendation: best ? best.process.name : "No listed process fits all constraints",
    summary: best
      ? `${best.process.name} best matches the chart for the supplied material, environment, thickness, and priority.${aluminumNote}`
      : `None of this machine's four processes satisfies every constraint you gave (material, environment, thickness). The closest is ${ranked[0].process.name} — relax one constraint (e.g. move indoors, or change process/material) and re-check the chart.${aluminumNote}`,
    processes: ranked.map(({ process, materialFit, environmentFit, thicknessFit }) => ({
      name: process.name,
      fit: !materialFit || !environmentFit || !thicknessFit ? "not-suited" : best && process.name === best.process.name ? "recommended" : "possible",
      gas: process.gas,
      thickness: process.thickness,
      reason: !materialFit
        ? "Material is outside this machine/chart combination."
        : !environmentFit
          ? "Shielding gas makes windy outdoor use a poor fit."
          : !thicknessFit
            ? "Thickness is outside the chart’s stated envelope."
            : process.priorities.includes(input.priority as never)
              ? `Strong fit for ${input.priority}.`
              : "Usable, but not the strongest match for the stated priority.",
    })),
    source: {
      label: "Process selection chart p.1",
      page: 1,
      href: "/manual/pages/chart-01.png",
    },
  };
}
