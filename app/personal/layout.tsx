import QueryProvider from "../components/QueryProvider";

export default function PersonalLayout({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
