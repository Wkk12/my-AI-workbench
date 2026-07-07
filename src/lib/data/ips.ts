import { readJSONSafe, writeJSON } from "./base";
import type { IPIndex, IPItem } from "@/lib/types";

const INDEX_PATH = "ips/index.json";

function getIndex(): IPIndex {
  return readJSONSafe<IPIndex>(INDEX_PATH, { ips: [] });
}

function saveIndex(index: IPIndex): void {
  writeJSON(INDEX_PATH, index);
}

export function getAllIPs(): IPItem[] {
  return getIndex().ips.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getIP(id: string): IPItem | undefined {
  return getIndex().ips.find((ip) => ip.id === id);
}

export function saveIP(item: IPItem): void {
  const index = getIndex();
  const idx = index.ips.findIndex((ip) => ip.id === item.id);
  if (idx >= 0) {
    index.ips[idx] = { ...index.ips[idx], ...item };
  } else {
    index.ips.push(item);
  }
  saveIndex(index);
}

export function deleteIP(id: string): void {
  const index = getIndex();
  index.ips = index.ips.filter((ip) => ip.id !== id);
  saveIndex(index);
}
