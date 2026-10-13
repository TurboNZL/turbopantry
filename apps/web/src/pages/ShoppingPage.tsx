import { ShoppingCart } from 'lucide-react';

export function ShoppingPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Shopping</h1>
      <div className="card flex flex-col items-center gap-2 p-10 text-center">
        <ShoppingCart size={28} className="text-muted" />
        <p className="font-medium">No lists yet</p>
        <p className="max-w-md text-sm text-muted">Shared lists sorted by store category, and adding a recipe's ingredients in one tap, are on the roadmap.</p>
      </div>
    </div>
  );
}
