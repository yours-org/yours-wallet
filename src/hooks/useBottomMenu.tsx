import { useContext, useEffect } from "react";
import { BottomMenuContext } from "../contexts/BottomMenuContext";
import { useNavigate } from "react-router-dom";

export const useBottomMenu = () => {
  const context = useContext(BottomMenuContext);
  const navigate = useNavigate();

  if (!context) {
    throw new Error("useBottomMenu must be used within a BottomMenuProvier");
  }

  useEffect(() => {
    if (!context || !navigate) return;
    return context.selected === "bsv"
      ? navigate("/bsv-wallet")
      : context.selected === "ords"
      ? navigate("/ord-wallet")
      : context.selected === "settings"
      ? navigate("/settings")
      : undefined;
  }, [context, context.selected, navigate]);

  return context;
};
