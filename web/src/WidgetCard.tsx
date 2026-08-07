import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  DutyCycleResult,
  DutyCycleWidgetData,
  ProcessSelectionWidgetData,
  WidgetData,
} from "./types";

export default function WidgetCard({ widget }: { widget: WidgetData }) {
  return widget.kind === "duty-cycle" ? (
    <DutyCycleCard widget={widget} />
  ) : (
    <ProcessSelectionCard widget={widget} />
  );
}

function DutyCycleCard({ widget }: { widget: DutyCycleWidgetData }) {
  const [process, setProcess] = useState(widget.process);
  const [voltage, setVoltage] = useState(widget.voltage);
  const [amps, setAmps] = useState(widget.amps);
  const mode = widget.matrix[process][voltage];
  // Reset the slider only when the user switches mode — never on mount,
  // which would clobber the exact amperage the question was about.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setAmps(mode.ratedAmps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process, voltage]);
  const result = useMemo(() => dutyResult(mode, amps), [mode, amps]);
  const span = mode.currentRange.max - mode.currentRange.min;
  const continuousWidth = ((mode.continuousAmps - mode.currentRange.min) / span) * 100;
  const ratedWidth = ((mode.ratedAmps - mode.currentRange.min) / span) * 100;

  return (
    <section className="native-widget duty-widget" aria-label="Interactive duty-cycle calculator">
      <div className="widget-heading">
        <div>
          <span className="verified-pill">✓ Tool-verified</span>
          <h3>{widget.title}</h3>
          <p>{process} · {voltage}</p>
        </div>
        <a href={`/manual/pages/manual-${String(mode.page).padStart(2, "0")}.png`} target="_blank" rel="noreferrer">Owner’s manual p.{mode.page} ↗</a>
      </div>

      <div className="widget-switches">
        <div role="group" aria-label="Welding process">
          {(Object.keys(widget.matrix) as DutyCycleWidgetData["process"][]).map((option) => (
            <button key={option} className={process === option ? "active" : ""} onClick={() => setProcess(option)}>{option}</button>
          ))}
        </div>
        <div role="group" aria-label="Input voltage">
          {(["120V", "240V"] as const).map((option) => (
            <button key={option} className={voltage === option ? "active" : ""} onClick={() => setVoltage(option)}>{option}</button>
          ))}
        </div>
      </div>

      <label className="amp-control">
        <span>Welding current <strong>{amps}A</strong></span>
        <input
          aria-label="Welding current in amps"
          type="range"
          min={mode.currentRange.min}
          max={mode.currentRange.max}
          value={amps}
          onChange={(event) => setAmps(Number(event.target.value))}
        />
        <span className="range-labels">
          <span>{mode.currentRange.min}A</span>
          <span>{mode.continuousAmps}A continuous</span>
          <span>{mode.ratedAmps}A rated</span>
          <span>{mode.currentRange.max}A</span>
        </span>
        <span className="duty-zones" aria-hidden="true">
          <i className="zone continuous" style={{ width: `${continuousWidth}%` }} />
          <i className="zone rated" style={{ width: `${Math.max(0, ratedWidth - continuousWidth)}%` }} />
          <i className="zone unknown" style={{ flex: 1 }} />
        </span>
      </label>

      <div className={`duty-result ${result.status}`}>
        <div>
          <span className="result-kicker">{result.label}</span>
          <strong className="result-value">{result.percent === null ? "Not published" : `${result.percent}%`}</strong>
        </div>
        {result.weldMinutes !== null && result.restMinutes !== null && (
          <div className="time-pair">
            <span><small>WELD</small><strong>{formatMinutes(result.weldMinutes)}</strong></span>
            <span><small>REST</small><strong>{formatMinutes(result.restMinutes)}</strong></span>
          </div>
        )}
        <p>{result.explanation}</p>
      </div>
    </section>
  );
}

function dutyResult(
  mode: DutyCycleWidgetData["matrix"][DutyCycleWidgetData["process"]][DutyCycleWidgetData["voltage"]],
  amps: number,
): DutyCycleResult {
  const { min, max } = mode.currentRange;
  const { continuousAmps, ratedAmps, ratedPercent } = mode;
  if (amps < min || amps > max) {
    return { status: "out-of-range", percent: null, weldMinutes: null, restMinutes: null, label: "Outside published range", explanation: `The manual rates this mode for ${min}–${max}A.` };
  }
  if (amps <= continuousAmps) {
    return { status: "continuous", percent: 100, weldMinutes: 10, restMinutes: 0, label: "Continuous-use zone", explanation: `The manual publishes 100% duty cycle at ${continuousAmps}A; staying at or below it is the conservative published limit. Thermal protection and normal safety precautions still apply.` };
  }
  if (amps === ratedAmps) {
    return { status: "exact", percent: ratedPercent, weldMinutes: ratedPercent / 10, restMinutes: 10 - ratedPercent / 10, label: "Exact published rating", explanation: "This exact point is printed in the owner’s manual." };
  }
  if (amps < ratedAmps) {
    return { status: "conservative", percent: ratedPercent, weldMinutes: ratedPercent / 10, restMinutes: 10 - ratedPercent / 10, label: "Conservative published limit", explanation: `No curve is published between ${continuousAmps}A and ${ratedAmps}A, so this card uses the next published limit instead of inventing precision.` };
  }
  return { status: "unsupported", percent: null, weldMinutes: null, restMinutes: null, label: "No published duty-cycle value", explanation: `The machine reaches this current, but the manual gives no duration above its ${ratedAmps}A rated point.` };
}

function ProcessSelectionCard({ widget }: { widget: ProcessSelectionWidgetData }) {
  return (
    <section className="native-widget process-widget" aria-label="Welding process decision card">
      <div className="widget-heading">
        <div>
          <span className="verified-pill">✓ Chart-grounded</span>
          <h3>{widget.title}</h3>
          <p>{widget.inputs.material}{widget.inputs.gauge !== undefined ? ` · ${widget.inputs.gauge} gauge` : ""} · {widget.inputs.environment}</p>
        </div>
        <a href={widget.source.href} target="_blank" rel="noreferrer">{widget.source.label} ↗</a>
      </div>
      <div className="recommendation">
        <small>BEST MATCH</small>
        <strong>{widget.recommendation}</strong>
        <p>{widget.summary}</p>
      </div>
      <div className="process-grid">
        {widget.processes.map((process) => (
          <div className={`process-row ${process.fit}`} key={process.name}>
            <span className="fit-dot" />
            <div><strong>{process.name}</strong><small>{process.gas} · {process.thickness}</small></div>
            <p>{process.reason}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatMinutes(minutes: number): string {
  const whole = Math.floor(minutes);
  const seconds = Math.round((minutes - whole) * 60);
  return `${whole}:${String(seconds).padStart(2, "0")}`;
}
