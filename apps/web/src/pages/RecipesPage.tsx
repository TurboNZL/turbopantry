import { BookOpen } from 'lucide-react';

export function RecipesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Recipes</h1>
      <div className="card flex flex-col items-center gap-2 p-10 text-center">
        <BookOpen size={28} className="text-muted" />
        <p className="font-medium">No recipes yet</p>
        <p className="max-w-md text-sm text-muted">Importing from websites, Instagram and Osta links comes next, then your own recipes.</p>
      </div>
    </div>
  );
}
