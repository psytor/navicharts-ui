import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NavBar, Container, Footer } from 'astrogators-shared-ui';

const STARCHARTS_HASH_IDS = new Set(['guild', 'official', 'bookmarked', 'moderation']);

interface LayoutProps {
  children: ReactNode;
  rightExtras?: ReactNode;
  containerMaxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

/**
 * NavBar/Container/Footer wrapper each page renders itself with — mirrors
 * mod-ledger-ui's Layout.tsx exactly (each app owns its own instance, since
 * shared-ui stays router-agnostic). `activeSectionId` is derived here from
 * the route, same reasoning as mod-ledger-ui's Layout: "mine"/"guild"/
 * "official"/"bookmarked"/"moderation" are anchors into the one
 * /starcharts page, not separate destinations, so the hash decides which
 * one highlights.
 */
export default function Layout({ children, rightExtras, containerMaxWidth = 'lg' }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const starchartsHash = location.hash.slice(1);
  const activeSectionId = location.pathname === '/'
    ? 'overview'
    : location.pathname.startsWith('/starcharts')
    ? (STARCHARTS_HASH_IDS.has(starchartsHash) ? starchartsHash : 'mine')
    : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <NavBar
        currentApp="navicharts"
        activeSectionId={activeSectionId}
        onNavigate={(section, event) => {
          event.preventDefault();
          navigate(section.href.replace(/^\/navicharts/, ''));
        }}
        rightExtras={rightExtras}
      />
      <Container maxWidth={containerMaxWidth} className="app">
        {children}
      </Container>
      <Footer />
    </div>
  );
}
