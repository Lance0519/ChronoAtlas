import { useContext } from "react";
import { AtlasContext } from "../store/atlasStore";

export function useAtlas() {
  const value = useContext(AtlasContext);
  if (!value) throw new Error("useAtlas must be used inside AtlasProvider");
  return value;
}
