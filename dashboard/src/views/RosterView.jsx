import { useState, useMemo } from "react";
import { Users, Search } from "lucide-react";
import PersonCard from "../components/PersonCard";
import { Loading, Empty, ErrorState } from "../components/states";
import { useData } from "../context/DataContext";
import { personKey, personState, personLabel } from "../lib/format";

/* People (PRD FR-W4): best-frame cards with search and a status filter. */
export default function RosterView() {
  const { people, peopleLoading, peopleError, nowMs } = useData();
  const [filter, setFilter] = useState("ALL");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return people.filter((p) => {
      const st = personState(p, nowMs);
      if (filter !== "ALL" && st !== filter) return false;
      if (!query) return true;
      return [personLabel(p), p.id, p.camera, p.zone].filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [people, filter, q, nowMs]);

  return (
    <div className="panel">
      <div className="ph"><Users size={14} className="cyan" /><span className="t">People</span>
        <span className="r">{people.length} tracked</span></div>
      <div className="pb">
        <div className="filters" style={{ marginBottom: 14 }}>
          <span className="search">
            <Search size={13} className="dim" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search by id, zone or camera" aria-label="Search people" />
          </span>
          {["ALL", "TRACKING", "LOST"].map((x) => (
            <button key={x} type="button" className={`fbtn ${filter === x ? "on" : ""}`} aria-pressed={filter === x} onClick={() => setFilter(x)}>{x}</button>
          ))}
        </div>

        {peopleLoading ? <Loading label="Loading people…" />
          : peopleError ? <ErrorState message={peopleError} />
          : list.length ? (
            <div className="roster">{list.map((p) => <PersonCard key={personKey(p)} p={p} nowMs={nowMs} />)}</div>
          ) : people.length ? (
            <Empty title="No matches" hint="Nobody matches this filter or search." icon={Search} />
          ) : (
            <Empty title="No people seen yet" hint="The Pi adds one card per tracked person, with their best photo." icon={Users} />
          )}
      </div>
    </div>
  );
}
