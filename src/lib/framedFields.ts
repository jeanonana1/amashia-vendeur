import { useEffect } from "react";

/** Active la présentation « chaque champ dans son cadre » (voir styles.css) tant que la page est affichée. */
export function useFramedFields() {
  useEffect(() => {
    document.documentElement.classList.add("fields-framed");
    return () => document.documentElement.classList.remove("fields-framed");
  }, []);
}
