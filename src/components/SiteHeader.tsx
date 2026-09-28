import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Brand } from "./Brand";

interface SiteHeaderProps {
  home?: boolean;
  onHowItWorks?: () => void;
}

export function SiteHeader({ home = false, onHowItWorks }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [menuOpen]);

  const howItWorks = onHowItWorks ? (
    <button className="nav-link" type="button" onClick={onHowItWorks}>
      How it works
    </button>
  ) : (
    <Link className="nav-link" to="/#how-it-works">
      How it works
    </Link>
  );

  const pageLinks = (
    <>
      <NavLink className="nav-link" to="/about" onClick={() => setMenuOpen(false)}>
        About Us
      </NavLink>
      <NavLink className="nav-link" to="/careers" onClick={() => setMenuOpen(false)}>
        Careers
      </NavLink>
      <NavLink className="nav-link" to="/privacy" onClick={() => setMenuOpen(false)}>
        Privacy
      </NavLink>
    </>
  );

  return (
    <header ref={headerRef} className={home ? "landing-header" : "simple-header"}>
      <div className="container header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Primary navigation">
          {howItWorks}
          {pageLinks}
        </nav>
        <div className="header-mobile-actions">
          <Link className="mobile-about-link" to="/about" onClick={() => setMenuOpen(false)}>
            About Us
          </Link>
          <button
            ref={toggleRef}
            className="mobile-menu-toggle"
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
            <span>Menu</span>
          </button>
        </div>
      </div>
      {menuOpen ? (
        <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">
          <div className="container mobile-nav-inner">
            {!home ? <Link className="nav-link" to="/" onClick={() => setMenuOpen(false)}>Home</Link> : null}
            {onHowItWorks ? (
              <button className="nav-link" type="button" onClick={() => {
                setMenuOpen(false);
                onHowItWorks();
              }}>How it works</button>
            ) : (
              <Link className="nav-link" to="/#how-it-works" onClick={() => setMenuOpen(false)}>
                How it works
              </Link>
            )}
            {pageLinks}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
