import "server-only";
import { cookies } from "next/headers";

/** "Only my college" defaults to on; the choice is remembered in a cookie and can be overridden by `?campus=`. */
export async function onlyMyCampus(param: string | string[] | undefined): Promise<boolean> {
  const value = typeof param === "string" ? param : (await cookies()).get("dibs_campus")?.value;
  return value !== "all";
}
