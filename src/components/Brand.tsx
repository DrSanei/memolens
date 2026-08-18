import { Link } from "react-router-dom";
import { MemolensMark } from "./MemolensMark";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" to="/" aria-label="Memolens home">
      <MemolensMark className="brand-mark" />
      <span className={compact ? "brand-name compact" : "brand-name"}>Memolens</span>
    </Link>
  );
}
