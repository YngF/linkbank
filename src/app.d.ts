// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    interface Locals {
      userId: number | null;
      user: { id: number; username: string; is_admin: number } | null;
    }
    // interface Error {}
    // interface PageData {}
    // interface Platform {}
  }
}

export {};
