"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  getHospital,
  listCustomers,
  listDevices,
  type Customer,
  type Device,
} from "@/lib/business";
import {
  ARCHIVE_FIELD_DEFS,
  displayValue,
  regionLabelFromProvince,
  regionLabelFromCity,
  type ArchiveFieldKey,
} from "@/lib/hospital-archive";
import type { Hospital } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface HospitalDetailSheetProps {
  hospitalId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HospitalDetailSheet({
  hospitalId,
  open,
  onOpenChange,
}: HospitalDetailSheetProps) {
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !hospitalId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const [hRes, dRes, cRes] = await Promise.all([
        getHospital(hospitalId),
        listDevices(hospitalId),
        listCustomers({ hospitalId, page: 1, pageSize: 20 }),
      ]);
      if (cancelled) return;
      if (hRes.error) {
        setError(hRes.error);
        setHospital(null);
        setDevices([]);
        setCustomers([]);
      } else {
        setHospital(hRes.hospital || null);
        setDevices(dRes.items);
        setCustomers(cRes.items);
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, hospitalId]);

  const values = useMemo(() => {
    const archive = hospital?.archive || {};
    const device = devices[0];
    const customer = customers[0];
    const map: Partial<Record<ArchiveFieldKey, string>> = {
      region: regionLabelFromCity(hospital?.city) || regionLabelFromProvince(hospital?.province),
      branchOffice: archive.branchOffice || hospital?.city || "",
      customerName: hospital?.name || "",
      customerCode: archive.customerCode || "",
      customerLevel: hospital?.level || "",
      model: device?.model || hospital?.deviceModels?.[0] || archive.model || "",
      serialNo: device?.serialNo || archive.serialNo || "",
      contactName: customer?.name || archive.contactName || "",
      contactPhone: customer?.phone || archive.contactPhone || "",
      installedAt: device?.installedAt || archive.installedAt || "",
      enabledAt: archive.enabledAt || "",
      annualRevenue: archive.annualRevenue || "",
      usageLocation: archive.usageLocation || "",
      projectCount: archive.projectCount || "",
      mindrayReagentCount: archive.mindrayReagentCount || "",
      matchingRate: archive.matchingRate || "",
      otherAnalyzers: archive.otherAnalyzers || "",
      mindraySampleVolume: archive.mindraySampleVolume || "",
      totalSampleVolume: archive.totalSampleVolume || "",
      qcVendor: archive.qcVendor || "",
      qcLevels: archive.qcLevels || "",
      qcCycle: archive.qcCycle || "",
      reagentSupplier: archive.reagentSupplier || "",
      mindrayProjects: archive.mindrayProjects || "",
      newProjects: archive.newProjects || "",
      unusedProjects: archive.unusedProjects || "",
      missingProjects: archive.missingProjects || "",
      archiveRemark: archive.archiveRemark || hospital?.remark || "",
    };
    return map;
  }, [hospital, devices, customers]);

  const sections = useMemo(() => {
    const order: string[] = [];
    const grouped = new Map<string, typeof ARCHIVE_FIELD_DEFS>();
    for (const field of ARCHIVE_FIELD_DEFS) {
      if (!grouped.has(field.section)) {
        grouped.set(field.section, []);
        order.push(field.section);
      }
      grouped.get(field.section)!.push(field);
    }
    return order.map((section) => ({
      section,
      fields: grouped.get(section) || [],
    }));
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,72rem)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border bg-card p-0 text-card-foreground shadow-xl sm:max-w-none">
        <DialogHeader className="shrink-0 border-b bg-muted/30 px-5 py-4 text-left">
          <DialogTitle className="pr-8 text-base">
            {hospital?.name || "客户档案"}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span>
              {hospital
                ? `${hospital.province} · ${hospital.city}`
                : "化免客户档案详情"}
            </span>
            {hospital ? (
              <Badge variant="outline" className="text-[10px]">
                {hospital.level}
              </Badge>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            sections.map((group) => (
              <section key={group.section} className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
                  {group.section}
                </h3>
                <div className="grid divide-y rounded-lg border bg-background md:grid-cols-2 md:divide-x md:divide-y-0">
                  {group.fields.map((field) => (
                    <div
                      key={field.key}
                      className="grid grid-cols-[8rem_1fr] gap-3 border-b px-4 py-3 text-sm last:border-b-0 md:border-b md:odd:border-r"
                    >
                      <div className="text-muted-foreground">{field.label}</div>
                      <div className="break-words whitespace-pre-wrap text-foreground">
                        {displayValue(values[field.key])}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
