'use client';

import { useFlowStore } from '@/stores/flowStore';
import { UpgradePlanModal } from '@/components/account/MyAccountView';
import { AppSidebar, SideMenuIcon } from '@/components/sidebar/AppSidebar';
import { Tooltip } from '@/components/ui/Tooltip';

/* The standing upgrade destination — someone who wants to compare plans with no specific task
   blocked. Every other UpgradePlanModal call site in the app fires mid-task over a locked
   feature or an exhausted quota, and stays a modal on purpose: an interrupt is the right shape
   for those. This route exists because that shape was wrong for the one entry point that isn't
   an interrupt — the sidebar's plan row used to land on My Account's billing tab, one more click
   short of the comparison it was asking for. UpgradePlanModal renders the identical content here
   via `presentation="page"`; only the chrome around it differs. */
export default function UpgradePlanPage() {
  const sidebarOpen = useFlowStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFlowStore((s) => s.setSidebarOpen);

  return (
    <div className="h-screen w-screen overflow-hidden bg-white flex relative">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 h-full flex flex-col">
        {/* Top bar (sidebar toggle only) — the same full-width 56px bar every other content page
            in the app uses (Projects, Docs, Chat, Book, Presentation), not folded into the
            content column below. AppSidebar renders nothing at all when closed
            (`{isOpen && (...)}`), so a page with no toggle of its own has no way back once it's
            closed — this page had that gap until it was pointed out.
            No Back button: the sidebar's own nav is how someone leaves this page, the same as
            every other page reached from the rail rather than a step in a flow. */}
        <div
          className="flex-shrink-0 flex items-center bg-white border-b border-border-light"
          style={{ height: 56, padding: '0 16px' }}
        >
          <Tooltip label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} position="right">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex-shrink-0 rounded-lg hover:bg-[#F6F7F9] transition-colors cursor-pointer flex items-center justify-center"
              style={{ width: 40, height: 40 }}
            >
              <SideMenuIcon active={sidebarOpen} />
            </button>
          </Tooltip>
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto">
          {/* Wider than UpgradePlanModal's own modal width (980, still what the compare-table math
              and the actual modal path use) — nothing here needs to line up with a Back button any
              more, and the grid inside `content` has no width of its own, so it simply fills
              whatever this wrapper gives it. 1120 over 980 is "slightly wider" cards, not a
              redesign. */}
          <div style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 32px 0' }}>
            <UpgradePlanModal presentation="page" onClose={() => {}} />
          </div>
        </div>
      </div>
    </div>
  );
}
