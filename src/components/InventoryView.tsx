import { Card } from 'astrogators-shared-ui';
import { CharacterCard } from './CharacterCard';
import type { UnitWithRoster } from '../types';

// Matches the in-game inventory's own ordering: owned units by GP
// descending (highest power first), then unowned units (no gp to sort by)
// grouped after, alphabetical so that section isn't just random catalog order.
function byGpThenName(a: UnitWithRoster, b: UnitWithRoster): number {
  const gpA = a.latest_snapshot?.gp;
  const gpB = b.latest_snapshot?.gp;
  if (gpA != null && gpB != null) return gpB - gpA;
  if (gpA != null) return -1;
  if (gpB != null) return 1;
  return a.name.localeCompare(b.name);
}

// Ships get their own tab later - filtering here (rather than inside
// CharacterCard) keeps that a one-line change plus a ShipCard swap.
export function InventoryView({ units }: { units: UnitWithRoster[] }) {
  const characters = units.filter((u) => u.unit_type === 'character').sort(byGpThenName);

  return (
    <Card chamfered chamferSize="lg" showDiagonalBorders diagonalBorderColor="var(--cyan)" className="inventory-panel">
      <h2 className="inventory-header">Inventory</h2>
      <div className="inventory-grid">
        {characters.map((u) => (
          <CharacterCard key={u.id} unit={u} />
        ))}
      </div>
    </Card>
  );
}
