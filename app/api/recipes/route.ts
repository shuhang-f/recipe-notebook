import { env } from 'cloudflare:workers';

type RecipeRow = {
  id: string;
  title: string;
  ingredients: string;
  directions: string;
  created_at: string;
  updated_at: string;
};

type RecipePayload = {
  id?: unknown;
  title?: unknown;
  ingredients?: unknown;
  directions?: unknown;
};

const createRecipesTable = `
  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    ingredients TEXT NOT NULL DEFAULT '',
    directions TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

function toRecipe(row: RecipeRow) {
  return {
    id: row.id,
    title: row.title,
    ingredients: row.ingredients,
    directions: row.directions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function textValue(value: unknown, fallback: string, maxLength: number) {
  return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
}

async function getDatabase() {
  const database = (env as unknown as { DB?: D1Database }).DB;

  if (!database) {
    throw new Error('Recipe storage is not available.');
  }

  await database.prepare(createRecipesTable).run();
  return database;
}

async function readPayload(request: Request): Promise<RecipePayload> {
  try {
    return (await request.json()) as RecipePayload;
  } catch {
    return {};
  }
}

function serverError(error: unknown) {
  console.error(error);
  return Response.json({ error: 'The recipe notebook could not reach its storage.' }, { status: 500 });
}

export async function GET() {
  try {
    const database = await getDatabase();
    const result = await database
      .prepare(
        `SELECT id, title, ingredients, directions, created_at, updated_at
         FROM recipes
         ORDER BY updated_at DESC, id DESC`,
      )
      .all<RecipeRow>();

    return Response.json({ recipes: result.results.map(toRecipe) });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await readPayload(request);
    const database = await getDatabase();
    const now = new Date().toISOString();
    const recipe: RecipeRow = {
      id: crypto.randomUUID(),
      title: textValue(payload.title, '', 200),
      ingredients: textValue(payload.ingredients, '', 50000),
      directions: textValue(payload.directions, '', 100000),
      created_at: now,
      updated_at: now,
    };

    await database
      .prepare(
        `INSERT INTO recipes (id, title, ingredients, directions, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        recipe.id,
        recipe.title,
        recipe.ingredients,
        recipe.directions,
        recipe.created_at,
        recipe.updated_at,
      )
      .run();

    return Response.json({ recipe: toRecipe(recipe) }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await readPayload(request);
    if (typeof payload.id !== 'string' || !payload.id) {
      return Response.json({ error: 'A recipe id is required.' }, { status: 400 });
    }

    const database = await getDatabase();
    const existing = await database
      .prepare(
        `SELECT id, title, ingredients, directions, created_at, updated_at
         FROM recipes
         WHERE id = ?`,
      )
      .bind(payload.id)
      .first<RecipeRow>();

    if (!existing) {
      return Response.json({ error: 'That recipe no longer exists.' }, { status: 404 });
    }

    const updated: RecipeRow = {
      ...existing,
      title: textValue(payload.title, existing.title, 200),
      ingredients: textValue(payload.ingredients, existing.ingredients, 50000),
      directions: textValue(payload.directions, existing.directions, 100000),
      updated_at: new Date().toISOString(),
    };

    await database
      .prepare(
        `UPDATE recipes
         SET title = ?, ingredients = ?, directions = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(updated.title, updated.ingredients, updated.directions, updated.updated_at, updated.id)
      .run();

    return Response.json({ recipe: toRecipe(updated) });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await readPayload(request);
    if (typeof payload.id !== 'string' || !payload.id) {
      return Response.json({ error: 'A recipe id is required.' }, { status: 400 });
    }

    const database = await getDatabase();
    const result = await database
      .prepare('DELETE FROM recipes WHERE id = ?')
      .bind(payload.id)
      .run();

    if (!result.meta.changes) {
      return Response.json({ error: 'That recipe no longer exists.' }, { status: 404 });
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    return serverError(error);
  }
}
