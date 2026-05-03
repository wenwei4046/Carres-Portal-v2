/**
 * Principal Dashboard — stub. Replaced by Task 15+16 with the full KPI strip
 * + 4-tile grid in this same milestone (M3). Wired up here so the sidebar
 * tab switch + principal route doesn't crash before the components land.
 */
interface Props {
  setTab: (t: string) => void;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function PrincipalDashboard(_props: Props) {
  return <div className="px-9 py-8">Dashboard coming next.</div>;
}
