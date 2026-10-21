import markup from "@/lib/stock/markup.json";
import { StockRuntime } from "@/components/stock-runtime";
export default function Home() {
  return <><div id="stock-root" dangerouslySetInnerHTML={{ __html: markup }} /><StockRuntime /></>;
}
