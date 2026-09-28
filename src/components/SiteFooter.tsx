import { Link } from "react-router-dom";
import { Brand } from "./Brand";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <Brand compact />
        <p>Supervised research prototype · Memos erased on refresh or close</p>
        <nav aria-label="Footer navigation">
          <Link to="/about">About Us</Link>
          <Link to="/careers">Careers</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}
