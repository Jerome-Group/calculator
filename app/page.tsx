import CalculatorGate from "@/components/calculator/CalculatorGate";
import { requireChatGPTUser } from "./chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireChatGPTUser("/");
  return <CalculatorGate />;
}
