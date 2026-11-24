import { jsPDF } from 'jspdf';
import { HazardReport, WorkerProfile } from '../types/routix';
import {
  formatSeverityLabel,
  formatSlaRemaining,
  formatStatusLabel,
  formatTierLabel,
} from './routixHelpers';

export function exportDispatchSummaryPdf(
  hazards: HazardReport[],
  workers: WorkerProfile[]
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const activeHazards = [...hazards]
    .filter((h) => h.status !== 'verified')
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const openCount = activeHazards.filter((h) => h.status === 'open').length;
  const dispatchedCount = activeHazards.filter((h) => h.status === 'dispatched').length;
  const pendingVerifyCount = activeHazards.filter(
    (h) => h.status === 'pending_verification'
  ).length;
  const busyWorkers = workers.filter((w) => !w.available);
  const availableWorkers = workers.filter((w) => w.available);
  const totalEscrowInr = activeHazards.reduce(
    (sum, h) => sum + (h.microJobPayoutInr || 0),
    0
  );
  const totalColdMixBags = activeHazards.reduce(
    (sum, h) => sum + (h.craterGeometry?.ircBags25Kg || 0),
    0
  );

  let y = margin;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 16) {
      doc.addPage();
      y = margin;
    }
  };

  // Top Header Band
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('ROUTIX · Civic Command Dispatch Report', margin, 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(
    `Active Hazards & Assigned Worker Status Summary  |  Generated: ${new Date().toLocaleString()}`,
    margin,
    18.5
  );

  y = 33;

  // Summary Strip
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'FD');

  const colW = contentWidth / 4;
  const summaryStats = [
    {
      label: 'ACTIVE HAZARDS',
      value: `${activeHazards.length}`,
      sub: `${openCount} open · ${dispatchedCount} active · ${pendingVerifyCount} QA`,
    },
    {
      label: 'WORKFORCE STATUS',
      value: `${busyWorkers.length} / ${workers.length} Assigned`,
      sub: `${availableWorkers.length} crews ready`,
    },
    {
      label: 'COLD-MIX ESTIMATE',
      value: `${totalColdMixBags} bags`,
      sub: 'IRC:SP:100 (25 kg/bag)',
    },
    {
      label: 'ACTIVE ESCROW POOL',
      value: `INR ${totalEscrowInr.toLocaleString('en-IN')}`,
      sub: 'DBT disbursement ready',
    },
  ];

  summaryStats.forEach((stat, idx) => {
    const x = margin + idx * colW + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(stat.label, x, y + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(stat.value, x, y + 12.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(stat.sub, x, y + 18);
  });

  y += 30;

  // Section 1: Active Hazards
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Active Hazards Queue (Sorted by PSI)', margin, y);
  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  if (activeHazards.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('No active hazards remaining. All reported defects are verified repaired.', margin, y);
    y += 8;
  } else {
    activeHazards.forEach((hazard, index) => {
      const sla = formatSlaRemaining(hazard.slaDeadlineAt);
      const assignedLine = hazard.assignedWorkerName
        ? `Assigned Crew: ${hazard.assignedWorkerName} (${hazard.assignedWorkerId ?? 'Crew'}${
            hazard.assignedDistanceKm !== undefined ? `, ${hazard.assignedDistanceKm} km` : ''
          }) · Status: ${formatStatusLabel(hazard.status)}`
        : `Assigned Crew: Unassigned — Awaiting Dispatch · Status: ${formatStatusLabel(hazard.status)}`;

      const titleLines = doc.splitTextToSize(
        `${index + 1}. [${hazard.id}] ${hazard.streetName} — ${hazard.title}`,
        contentWidth - 28
      );
      const actionLines = doc.splitTextToSize(
        `Action: ${hazard.recommendedAction}`,
        contentWidth - 6
      );

      const blockHeight = 16 + titleLines.length * 4.5 + actionLines.length * 4;
      ensureSpace(blockHeight + 4);

      doc.setFillColor(index % 2 === 0 ? 255 : 248, index % 2 === 0 ? 255 : 250, index % 2 === 0 ? 255 : 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, contentWidth, blockHeight, 1.5, 1.5, 'FD');

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(titleLines, margin + 3, y + 5.5);

      // Right-aligned PSI badge text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(hazard.severity === 'critical' ? 190 : 15, hazard.severity === 'critical' ? 18 : 23, hazard.severity === 'critical' ? 60 : 42);
      doc.text(`PSI ${hazard.priorityScore}`, pageWidth - margin - 3, y + 5.5, {
        align: 'right',
      });

      let innerY = y + 5.5 + titleLines.length * 4.5;

      // Meta line
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `${hazard.ward}  |  Severity: ${formatSeverityLabel(hazard.severity)}  |  ${sla.text}  |  ${hazard.repairMaterialEstimate}  |  Payout: INR ${hazard.microJobPayoutInr}`,
        margin + 3,
        innerY
      );
      innerY += 4.5;

      // Assigned worker status line
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      if (hazard.assignedWorkerName) {
        doc.setTextColor(4, 120, 87); // emerald-700
      } else {
        doc.setTextColor(180, 83, 9); // amber-700
      }
      doc.text(assignedLine, margin + 3, innerY);
      innerY += 4.5;

      // Action summary
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.setTextColor(100, 116, 139);
      doc.text(actionLines, margin + 3, innerY);

      y += blockHeight + 3;
    });
  }

  y += 5;
  ensureSpace(24);

  // Section 2: Assigned & Field Worker Statuses
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Worker & Contractor Assignment Statuses', margin, y);
  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  const sortedWorkers = [...workers].sort((a, b) => {
    if (a.available !== b.available) return a.available ? 1 : -1; // Assigned first
    return b.rating - a.rating;
  });

  sortedWorkers.forEach((worker, idx) => {
    const linkedHazard = hazards.find(
      (h) => h.assignedWorkerId === worker.id && h.status !== 'verified'
    );
    const assignmentText = linkedHazard
      ? `Active Task: ${linkedHazard.id} (${linkedHazard.streetName}) — ${formatStatusLabel(linkedHazard.status)}`
      : worker.available
      ? 'Status: Available for 2-5 km Micro-Gig / Dispatch'
      : 'Status: On Active Field Assignment';

    const rowHeight = 16;
    ensureSpace(rowHeight + 3);

    doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, rowHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `${worker.name} (${worker.id}) · ${formatTierLabel(worker.tier)}`,
      margin + 3,
      y + 5.5
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(linkedHazard || !worker.available ? 180 : 4, linkedHazard || !worker.available ? 83 : 120, linkedHazard || !worker.available ? 9 : 87);
    doc.text(
      linkedHazard || !worker.available ? 'DISPATCHED' : 'AVAILABLE',
      pageWidth - margin - 3,
      y + 5.5,
      { align: 'right' }
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${worker.specialty} · ${worker.neighborhood} · Rating ${worker.rating.toFixed(1)} · Avg ${worker.avgTurnaroundMins}m patch · ${worker.completedRepairs} repairs`,
      margin + 3,
      y + 10
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(51, 65, 85);
    doc.text(assignmentText, margin + 3, y + 14);

    y += rowHeight + 2.5;
  });

  // Page Footers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'Routix · Detect · Report · Repair — Civic Command Dispatch Summary',
      margin,
      pageHeight - 8
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 8, {
      align: 'right',
    });
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  doc.save(`routix-dispatch-report-${dateStamp}.pdf`);
}
