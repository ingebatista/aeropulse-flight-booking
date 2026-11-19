import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { UUID_V4_PATTERN } from '@aeropulse/shared';

const STORAGE_KEY = 'aeropulse.clientId';

@Injectable({ providedIn: 'root' })
export class ClientIdentity {
  private readonly window = inject(DOCUMENT).defaultView!;
  readonly id = this.load();

  private load(): string {
    const storage = this.window.sessionStorage;
    const stored = storage.getItem(STORAGE_KEY);
    const id =
      stored && UUID_V4_PATTERN.test(stored)
        ? stored.toLowerCase()
        : this.window.crypto.randomUUID();
    storage.setItem(STORAGE_KEY, id);
    return id;
  }
}
