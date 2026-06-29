import type { PayrollTemplate, PayrollRun } from "./types";

const TEMPLATE_KEY = "stellar_spend_payroll_templates";
const RUN_KEY = "stellar_spend_payroll_runs";

export class PayrollTemplateStorage {
    static save(template: PayrollTemplate): void {
        const all = this.getAll();
        all.push(template);
        localStorage.setItem(TEMPLATE_KEY, JSON.stringify(all));
    }

    static update(id: string, updates: Partial<PayrollTemplate>): void {
        const all = this.getAll();
        const index = all.findIndex((t) => t.id === id);
        if (index !== -1) {
            all[index] = { ...all[index], ...updates, updatedAt: Date.now() };
            localStorage.setItem(TEMPLATE_KEY, JSON.stringify(all));
        }
    }

    static getAll(): PayrollTemplate[] {
        try {
            return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || "[]");
        } catch {
            return [];
        }
    }

    static getByUser(userAddress: string): PayrollTemplate[] {
        return this.getAll().filter((t) => t.userAddress === userAddress);
    }

    static getById(id: string): PayrollTemplate | undefined {
        return this.getAll().find((t) => t.id === id);
    }

    static delete(id: string): void {
        const all = this.getAll();
        localStorage.setItem(
            TEMPLATE_KEY,
            JSON.stringify(all.filter((t) => t.id !== id))
        );
    }

    static generateId(): string {
        return `payroll_template_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
}

export class PayrollRunStorage {
    static save(run: PayrollRun): void {
        const all = this.getAll();
        all.push(run);
        localStorage.setItem(RUN_KEY, JSON.stringify(all));
    }

    static update(id: string, updates: Partial<PayrollRun>): void {
        const all = this.getAll();
        const index = all.findIndex((r) => r.id === id);
        if (index !== -1) {
            all[index] = { ...all[index], ...updates, updatedAt: Date.now() };
            localStorage.setItem(RUN_KEY, JSON.stringify(all));
        }
    }

    static getAll(): PayrollRun[] {
        try {
            return JSON.parse(localStorage.getItem(RUN_KEY) || "[]");
        } catch {
            return [];
        }
    }

    static getByTemplate(templateId: string): PayrollRun[] {
        return this.getAll().filter((r) => r.templateId === templateId);
    }

    static getById(id: string): PayrollRun | undefined {
        return this.getAll().find((r) => r.id === id);
    }

    static getPendingApprovals(userAddress: string): PayrollRun[] {
        return this.getAll().filter(
            (r) => r.userAddress === userAddress && r.status === "pending_approval"
        );
    }

    static generateId(): string {
        return `payroll_run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
}
