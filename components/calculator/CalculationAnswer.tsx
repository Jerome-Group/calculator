import type { Entry } from "@/lib/calculator/types";
import { formatDisplayApprox } from "@/lib/calculator/display-format";
import MathView from "./MathView";
import RichResult from "./RichResult";

type AnswerProps = {
  result: Readonly<Entry["result"]>;
  displayDecimals: number;
  onSave?: (source: string) => void;
};

export function CalculationStatus({
  status,
}: {
  status: Entry["result"]["status"];
}) {
  const labels = {
    exact: "Exact",
    numeric: "Approximate",
    unresolved: "Unresolved",
    conditional: "Needs attention",
    divergent: "Needs attention",
    error: "Needs attention",
  } satisfies Record<Entry["result"]["status"], string>;
  return (
    <span className={"result-badge status-" + status}>{labels[status]}</span>
  );
}

export function CalculationDetails({
  data,
  sources,
  onSave,
  displayDecimals,
}: {
  data: Record<string, unknown>;
  sources?: Entry["result"]["detailSources"];
  displayDecimals: number;
  onSave?: AnswerProps["onSave"];
}) {
  return (
    <div className="table-scroll">
      <table>
        <tbody>
          {Object.entries(data).map(([key, value]) => (
            <tr key={key}>
              <th>{key}</th>
              <td>
                <pre>
                  {formatDisplayApprox(
                    typeof value === "string"
                      ? value
                      : JSON.stringify(value, null, 2),
                    displayDecimals,
                  )}
                </pre>
                {value !== null && sources?.[key] && onSave && (
                  <button onClick={() => onSave(sources[key])}>
                    Save value
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CalculationAnswer({
  result,
  displayDecimals,
  onSave,
}: AnswerProps) {
  return (
    <div className="answer">
      {result.status === "error" ? (
        <p>{result.text}</p>
      ) : result.display ? (
        <RichResult
          node={result.display}
          displayDecimals={displayDecimals}
          numeric={result.status === "numeric"}
        />
      ) : result.latex ? (
        <MathView
          latex={result.latex}
          block
          displayDecimals={displayDecimals}
          numeric={result.status === "numeric"}
        />
      ) : result.details ? (
        <CalculationDetails
          data={result.details}
          sources={result.detailSources}
          displayDecimals={displayDecimals}
          onSave={onSave}
        />
      ) : (
        <pre>{formatDisplayApprox(result.text, displayDecimals)}</pre>
      )}
    </div>
  );
}
