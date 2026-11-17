import { redirect } from "next/navigation";

export default function SurveyCampaignProgressRedirect() {
  redirect("/dashboard/surveys/campaigns?tab=progress");
}
