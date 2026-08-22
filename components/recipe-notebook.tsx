'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Recipe = {
  id: string;
  title: string;
  ingredients: string;
  directions: string;
  createdAt: string;
  updatedAt: string;
};

type SaveState = 'saved' | 'saving' | 'error';

function displayTitle(recipe: Recipe) {
  return recipe.title.trim() || 'Untitled recipe';
}

function displayPreview(recipe: Recipe) {
  const firstIngredient = recipe.ingredients
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  return firstIngredient || 'No ingredients yet';
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(body.error || 'Something went wrong.');
  }

  return body;
}

export function RecipeNotebook() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const revisions = useRef(new Map<string, number>());
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRecipes() {
      try {
        const response = await fetch('/api/recipes', { signal: controller.signal });
        const body = await readJson<{ recipes: Recipe[] }>(response);
        setRecipes(body.recipes);
        setSelectedId(body.recipes[0]?.id ?? null);
      } catch (loadError) {
        if (!(loadError instanceof DOMException && loadError.name === 'AbortError')) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load recipes.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadRecipes();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  const selectedRecipe = recipes.find((recipe) => recipe.id === selectedId) ?? null;

  const visibleRecipes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return recipes;
    }

    return recipes.filter((recipe) =>
      [recipe.title, recipe.ingredients, recipe.directions]
        .join('\n')
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, recipes]);

  async function createRecipe() {
    setCreating(true);
    setError(null);

    try {
      const response = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await readJson<{ recipe: Recipe }>(response);
      setRecipes((current) => [body.recipe, ...current]);
      setSelectedId(body.recipe.id);
      setQuery('');
      setSaveStates((current) => ({ ...current, [body.recipe.id]: 'saved' }));
      window.requestAnimationFrame(() => titleRef.current?.focus());
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create a recipe.');
    } finally {
      setCreating(false);
    }
  }

  async function saveRecipe(recipe: Recipe, revision: number) {
    setSaveStates((current) => ({ ...current, [recipe.id]: 'saving' }));

    try {
      const response = await fetch('/api/recipes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe),
      });
      await readJson<{ recipe: Recipe }>(response);

      if (revisions.current.get(recipe.id) === revision) {
        setSaveStates((current) => ({ ...current, [recipe.id]: 'saved' }));
      }
    } catch (saveError) {
      if (revisions.current.get(recipe.id) === revision) {
        setSaveStates((current) => ({ ...current, [recipe.id]: 'error' }));
        setError(saveError instanceof Error ? saveError.message : 'Could not save this recipe.');
      }
    }
  }

  function updateRecipe(changes: Partial<Pick<Recipe, 'title' | 'ingredients' | 'directions'>>) {
    if (!selectedRecipe) {
      return;
    }

    const updatedRecipe = {
      ...selectedRecipe,
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    const revision = (revisions.current.get(updatedRecipe.id) ?? 0) + 1;
    revisions.current.set(updatedRecipe.id, revision);
    setRecipes((current) =>
      current.map((recipe) => (recipe.id === updatedRecipe.id ? updatedRecipe : recipe)),
    );
    setSaveStates((current) => ({ ...current, [updatedRecipe.id]: 'saving' }));

    const existingTimer = saveTimers.current.get(updatedRecipe.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      saveTimers.current.delete(updatedRecipe.id);
      void saveRecipe(updatedRecipe, revision);
    }, 650);
    saveTimers.current.set(updatedRecipe.id, timer);
  }

  async function deleteRecipe() {
    if (!selectedRecipe || !window.confirm(`Delete “${displayTitle(selectedRecipe)}”?`)) {
      return;
    }

    setDeleting(true);
    setError(null);
    const timer = saveTimers.current.get(selectedRecipe.id);
    if (timer) {
      clearTimeout(timer);
      saveTimers.current.delete(selectedRecipe.id);
    }

    try {
      const response = await fetch('/api/recipes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedRecipe.id }),
      });

      if (!response.ok) {
        await readJson(response);
      }

      const remainingRecipes = recipes.filter((recipe) => recipe.id !== selectedRecipe.id);
      setRecipes(remainingRecipes);
      setSelectedId(remainingRecipes[0]?.id ?? null);
      setSaveStates((current) => {
        const next = { ...current };
        delete next[selectedRecipe.id];
        return next;
      });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete this recipe.');
    } finally {
      setDeleting(false);
    }
  }

  const selectedSaveState = selectedRecipe
    ? (saveStates[selectedRecipe.id] ?? 'saved')
    : 'saved';
  const saveLabel =
    selectedSaveState === 'error'
      ? 'Not saved'
      : selectedSaveState === 'saving'
        ? 'Saving…'
        : 'Saved';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">R</span>
          <div>
            <h1>Recipe Notebook</h1>
            <p>A quiet place for the food you make.</p>
          </div>
        </div>
        <button className="primary-button" type="button" onClick={createRecipe} disabled={creating}>
          {creating ? 'Adding…' : '+ New recipe'}
        </button>
      </header>

      {error ? (
        <div className="error-banner" role="alert">
          {error}
        </div>
      ) : null}

      <main className="workspace">
        <aside className="sidebar" aria-label="Recipe list">
          <div className="sidebar-heading">
            <h2>Your recipes</h2>
            <span className="recipe-count">
              {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}
            </span>
          </div>

          <label className="search-wrap">
            <span className="sr-only">Search recipes</span>
            <input
              className="search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search recipes"
            />
          </label>

          <div className="recipe-list" role="listbox" aria-label="Recipes">
            {visibleRecipes.map((recipe) => (
              <button
                className={`recipe-item${recipe.id === selectedId ? ' active' : ''}`}
                type="button"
                role="option"
                aria-selected={recipe.id === selectedId}
                key={recipe.id}
                onClick={() => setSelectedId(recipe.id)}
              >
                <span className="recipe-item-title">{displayTitle(recipe)}</span>
                <span className="recipe-item-meta">{displayPreview(recipe)}</span>
              </button>
            ))}

            {!loading && recipes.length === 0 ? (
              <p className="list-message">Your recipes will appear here.</p>
            ) : null}
            {!loading && recipes.length > 0 && visibleRecipes.length === 0 ? (
              <p className="list-message">No recipes match “{query}”.</p>
            ) : null}
          </div>
        </aside>

        <section className="editor" aria-label="Recipe editor">
          {loading ? (
            <div className="loading-editor">
              <p className="list-message">Opening your notebook…</p>
            </div>
          ) : selectedRecipe ? (
            <div className="editor-inner">
              <div className="editor-toolbar">
                <span className={`save-state ${selectedSaveState}`} aria-live="polite">
                  {saveLabel}
                </span>
                <button
                  className="delete-button"
                  type="button"
                  onClick={deleteRecipe}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>

              <label>
                <span className="sr-only">Recipe title</span>
                <input
                  ref={titleRef}
                  className="title-input"
                  value={selectedRecipe.title}
                  onChange={(event) => updateRecipe({ title: event.target.value })}
                  placeholder="Untitled recipe"
                  maxLength={200}
                />
              </label>

              <div className="recipe-fields">
                <label>
                  <span className="field-heading">
                    <strong>Ingredients</strong>
                    <span>One item per line</span>
                  </span>
                  <textarea
                    className="recipe-textarea ingredients"
                    value={selectedRecipe.ingredients}
                    onChange={(event) => updateRecipe({ ingredients: event.target.value })}
                    placeholder={'2 eggs\n1 cup flour\nA pinch of salt'}
                    maxLength={50000}
                  />
                </label>

                <label>
                  <span className="field-heading">
                    <strong>Directions</strong>
                    <span>Write it your way</span>
                  </span>
                  <textarea
                    className="recipe-textarea directions"
                    value={selectedRecipe.directions}
                    onChange={(event) => updateRecipe({ directions: event.target.value })}
                    placeholder="Write the steps in your own words…"
                    maxLength={100000}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="empty-editor">
              <div className="empty-content">
                <span className="empty-symbol" aria-hidden="true">R</span>
                <h2>Start with one recipe</h2>
                <p>Add the ingredients, jot down the directions, and the notebook saves as you type.</p>
                <button className="empty-button" type="button" onClick={createRecipe} disabled={creating}>
                  {creating ? 'Adding…' : 'Add your first recipe'}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
