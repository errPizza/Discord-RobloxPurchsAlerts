import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import SiteHeader from "../components/common/SiteHeader.jsx";
import { scrollToSection } from "../utils/scroll.js";

export default function LandingLayout({ children }) {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return undefined;

    const frame = requestAnimationFrame(() => scrollToSection(hash, false));

    return () => cancelAnimationFrame(frame);
  }, [hash]);

  return <div className="landing-page"><SiteHeader /><main>{children}</main><footer>© 2026 Another Game More Studio</footer></div>;
}
