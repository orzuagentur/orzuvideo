import { EmailTemplateDetail } from "@/components/EmailTemplateDetail";

export default async function EmailTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EmailTemplateDetail id={id} />;
}
