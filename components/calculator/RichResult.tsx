import MathView from "./MathView";
export default function RichResult({ node }: { node: any }) {
  if (!node) return null;
  if (node.type === "math") return <MathView latex={node.latex} block />;
  if (node.type === "text")
    return <span className="result-text">{node.text}</span>;
  if (node.type === "fields")
    return (
      <dl
        className={
          "result-fields" +
          (node.items.every(
            (item: any) =>
              (item.value.type === "math" &&
                !item.value.latex.includes("begin{") &&
                item.value.latex.length < 100) ||
              (item.value.type === "list" &&
                item.value.items.length <= 5 &&
                item.value.items.every(
                  (v: any) => v.type === "math" && v.latex.length < 30,
                )),
          )
            ? " result-fields-compact"
            : "")
        }
      >
        {node.items.map((item: any, i: number) => (
          <div key={i}>
            <dt>{item.label}</dt>
            <dd>
              <RichResult node={item.value} />
            </dd>
          </div>
        ))}
      </dl>
    );
  if (node.type === "list")
    return (
      <div
        className={
          "result-list" +
          (node.items.every(
            (item: any) => item.type === "math" || item.type === "text",
          )
            ? " result-list-simple"
            : "")
        }
      >
        {node.items.map((item: any, i: number) => (
          <div key={i}>
            <RichResult node={item} />
          </div>
        ))}
      </div>
    );
  if (node.type === "table")
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {node.headers.map((h: string, i: number) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {node.rows.slice(0, 200).map((row: any[], i: number) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>
                    <RichResult node={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {node.rows.length > 200 && <p>Showing the first 200 rows.</p>}
      </div>
    );
  return null;
}
