import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export default function Choice({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: (string | { value: string; label: string })[];
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) =>
          typeof o === "string" ? (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ) : (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ),
        )}
      </SelectContent>
    </Select>
  );
}
