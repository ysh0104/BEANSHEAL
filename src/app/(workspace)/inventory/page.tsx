"use client"

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useCanEdit } from "@/hooks/useCanEdit";
import { useAuth } from "@/context/AuthContext";
import { formatLastSyncedAt } from "@/lib/syncTime";
import { getSafetyStockConfigs } from "@/app/actions/safetyStockActions";
import { getDefaultSafetyQty, checkIsLowStock } from "@/lib/safetyStockHelper";
import { clearAllEcountItems } from "@/app/actions/inventoryActions";
import { isSyncNewerThan, isGithubRunFromTrigger } from "@/lib/syncInventoryStatus";
import { estimateTriggerProgress, estimateWatchProgress } from "@/lib/githubRunProgress";
import { parseLedgerFilesOnClient } from "@/lib/ecountLedgerImportClient";
import { BotSyncProgressBanner } from "@/components/BotSyncProgressBanner";

async function parseUploadResponse(res: Response): Promise<{ success?: boolean; message?: string; errors?: string[]; item_count?: number; row_count?: number }> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    throw new Error(
      res.status === 413
        ? "파일이 너무 큽니다. 브라우저에서 파싱 후 전송하도록 자동 처리됩니다 — 페이지 새로고침 후 다시 시도해 주세요."
        : snippet.startsWith("An error")
          ? `서버 오류 (${res.status}): 요청 시간 초과 또는 용량 제한일 수 있습니다. 잠시 후 다시 시도해 주세요.`
          : `서버 응답 오류 (${res.status}): ${snippet || "JSON 아님"}`
    );
  }
}

/** 재고수량: 반올림/올림 절대 없음! 최소 3자리 고정 표시 및 4자리 이상 원본 100% 표시 */
function formatQty(value: number | string) {
  if (value === null || value === undefined || value === "") return "0.000";
  const str = String(value).trim().replace(/,/g, "");
  if (!str || str === "NaN") return "0.000";
  const num = Number(str);
  if (!Number.isFinite(num)) return "0.000";

  const parts = str.split(".");
  const intPart = Number(parts[0]).toLocaleString("ko-KR");
  
  if (parts.length === 1) {
    return `${intPart}.000`;
  }
  
  const decimalPart = parts[1];
  if (decimalPart.length < 3) {
    return `${intPart}.${decimalPart.padEnd(3, "0")}`;
  }
  
  return `${intPart}.${decimalPart}`;
}

type BotWatchPhase = "idle" | "watching" | "failed" | "timeout";

type SyncStatusPayload = {
  last_synced_at: string | null;
  item_count: number;
  github_configured?: boolean;
  github_actions_url?: string | null;
  github_run?: {
    id?: number;
    status: string;
    conclusion: string | null;
    html_url: string;
    updated_at: string;
    created_at?: string;
  } | null;
  github_progress?: {
    percent: number;
    step_label: string;
  } | null;
};

type LedgerRow = {
  id: string;
  txn_date: string;
  partner_name: string;
  remarks: string;
  in_qty: number;
  out_qty: number;
  balance_qty: number | null;
  lot_no: string | null;
  fifo_lot_no?: string | null;
  row_kind: string;
};

function formatGithubRunLabel(run: SyncStatusPayload["github_run"]): string {
  if (!run) return "";
  if (run.status === "queued") return "GitHub: 대기 중";
  if (run.status === "in_progress") return "GitHub: 실행 중";
  if (run.status === "completed" && run.conclusion === "success") return "GitHub: 성공";
  if (run.status === "completed" && run.conclusion === "failure") return "GitHub: 실패";
  if (run.status === "completed") return "GitHub: 완료";
  return `GitHub: ${run.status}`;
}

function bumpProgressFloor(
  nextFloor: number,
  maxRef: { current: number },
  setPercent: (value: number | ((prev: number) => number)) => void
) {
  const floor = Math.max(0, Math.min(100, Math.round(nextFloor)));
  if (floor > maxRef.current) {
    maxRef.current = floor;
  }
  setPercent((prev) => Math.max(prev, maxRef.current));
}

function resetBotProgress(
  maxRef: { current: number },
  setPercent: (value: number) => void,
  setStepLabel: (value: string) => void
) {
  maxRef.current = 0;
  setPercent(0);
  setStepLabel("");
}

export default function InventoryPage() {
  const { canEdit } = useCanEdit("inventory");
  const { user } = useAuth();
  const isSuperAdmin = user?.permissionGroupName === "전체관리자";
  const [inventory, setInventory] = useState<any[]>([]);
  const [loadingInv, setLoadingInv] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [itemCount, setItemCount] = useState(0);
  const [botWatchPhase, setBotWatchPhase] = useState<BotWatchPhase>("idle");
  const [botStatusLine, setBotStatusLine] = useState("");
  const [botProgressPercent, setBotProgressPercent] = useState(0);
  const [botStepLabel, setBotStepLabel] = useState("");
  const botProgressMaxRef = useRef(0);
  const botFinishedRef = useRef(false);
  const [githubActionsUrl, setGithubActionsUrl] = useState<string | null>(null);
  const botBaselineRef = useRef<string | null>(null);
  const botTriggeredAtRef = useRef<string | null>(null);
  const [scrapedItems, setScrapedItems] = useState<any[]>([]);
  const [currentDate, setCurrentDate] = useState("");
  
  // [신규 상태] 수량 0 숨기기 체크박스 상태 관리 (기본값: 체크됨)
  const [hideZeroQty, setHideZeroQty] = useState(true);
  const [showOnlyLowStock, setShowOnlyLowStock] = useState(false);
  const [safetyConfigs, setSafetyConfigs] = useState<Record<string, number>>({});
  const [syncingMaster, setSyncingMaster] = useState(false);
  const [syncingLedger, setSyncingLedger] = useState(false);
  const [uploadingLedger, setUploadingLedger] = useState(false);
  const ledgerFileInputRef = useRef<HTMLInputElement>(null);
  const [ledgerLastSyncedAt, setLedgerLastSyncedAt] = useState<string | null>(null);
  const [ledgerSyncedCount, setLedgerSyncedCount] = useState(0);
  const [ledgerBotWatchPhase, setLedgerBotWatchPhase] = useState<BotWatchPhase>("idle");
  const [ledgerBotStatusLine, setLedgerBotStatusLine] = useState("");
  const [ledgerBotProgressPercent, setLedgerBotProgressPercent] = useState(0);
  const [ledgerBotStepLabel, setLedgerBotStepLabel] = useState("");
  const ledgerProgressMaxRef = useRef(0);
  const ledgerFinishedRef = useRef(false);
  const ledgerBaselineRef = useRef<string | null>(null);
  const ledgerTriggeredAtRef = useRef<string | null>(null);
  const [rawLogModalData, setRawLogModalData] = useState<any>(null);
  const [ledgerModal, setLedgerModal] = useState<{
    prodCd: string;
    prodNm: string;
    loading: boolean;
    syncing: boolean;
    rows: LedgerRow[];
    periodLabel: string;
    error: string;
  } | null>(null);

  const refreshLedgerStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync-inventory/ledger", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.last_synced_at) setLedgerLastSyncedAt(data.last_synced_at);
      if (typeof data.synced_item_count === "number") setLedgerSyncedCount(data.synced_item_count);
      return data;
    } catch {
      return null;
    }
  }, []);

  const refreshSyncStatus = useCallback(async (): Promise<SyncStatusPayload | null> => {
    try {
      const res = await fetch("/api/sync-inventory/status", { cache: "no-store" });
      if (!res.ok) return null;
      const data: SyncStatusPayload = await res.json();
      if (data.last_synced_at) setLastSyncedAt(data.last_synced_at);
      if (typeof data.item_count === "number") setItemCount(data.item_count);
      if (data.github_actions_url) setGithubActionsUrl(data.github_actions_url);
      return data;
    } catch {
      return null;
    }
  }, []);

  const handleClearAllInventory = async () => {
    if (!isSuperAdmin) {
      alert("재고현황 전체 삭제는 전체관리자만 가능합니다.");
      return;
    }
    if (
      !confirm(
        "ecount_items 재고 마스터를 전부 삭제합니다.\n\n· 품목코드/재고수량 전체가 비워집니다\n· 되돌릴 수 없습니다\n\n계속하시겠습니까?"
      )
    ) {
      return;
    }
    if (!confirm("정말 삭제하시겠습니까? (두 번째 확인)")) return;

    setLoadingInv(true);
    try {
      const res = await clearAllEcountItems(user?.id);
      if (res.success) {
        setInventory([]);
        setLastSyncedAt(null);
        setItemCount(0);
        alert("재고현황 데이터를 모두 삭제했습니다.");
      } else {
        alert(`삭제 실패: ${res.error}`);
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "삭제 중 오류");
    } finally {
      setLoadingInv(false);
    }
  };

  const botSyncInProgress =
    syncingMaster || syncingLedger || uploadingLedger || botWatchPhase === "watching" || ledgerBotWatchPhase === "watching";

  const handleSyncMaster = async () => {
    if (botSyncInProgress) {
      alert("이미 재고 봇이 GitHub Actions에서 실행 중입니다. 완료될 때까지 기다려 주세요.");
      return;
    }

    if (
      !confirm(
        "재고 봇 동기화를 실행할까요?\n\n· GitHub 클라우드에서 자동 로그인 → 재고 엑셀 다운 → DB 반영\n· 1~3분 후 화면에서 동기화 시간이 갱신됩니다\n· PC 설치 불필요"
      )
    )
      return;

    setSyncingMaster(true);
    setBotWatchPhase("watching");
    setBotStatusLine("GitHub 재고 봇 시작 요청 중…");
    resetBotProgress(botProgressMaxRef, setBotProgressPercent, setBotStepLabel);
    botFinishedRef.current = false;
    bumpProgressFloor(1, botProgressMaxRef, setBotProgressPercent);
    setBotStepLabel("재고 봇 시작 요청 중…");
    botBaselineRef.current = lastSyncedAt;
    const triggeredAt = new Date().toISOString();
    botTriggeredAtRef.current = triggeredAt;

    await refreshSyncStatus();

    try {
      const res = await fetch("/api/sync-inventory", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setBotStatusLine("GitHub Actions에서 봇 실행 중…");
      } else {
        setBotWatchPhase("failed");
        setBotStatusLine(data.message || "봇 시작 실패");
        setRawLogModalData({
          title: "재고 동기화 오류",
          error: data.message || data.error || "동기화 실패",
          rawResponse: data,
        });
        alert(data.message || data.error || "동기화에 실패했습니다.");
      }
    } catch (err: unknown) {
      setBotWatchPhase("failed");
      setBotStatusLine("봇 트리거 통신 오류");
      setRawLogModalData({
        title: "재고 동기화 오류",
        error: err instanceof Error ? err.message : "동기화 중 오류",
        rawResponse: { error: err instanceof Error ? err.message : "네트워크/서버 통신 실패" },
      });
    } finally {
      setSyncingMaster(false);
    }
  };

  const handleSyncLedger = async () => {
    if (botSyncInProgress) {
      alert("이미 GitHub 봇이 실행 중입니다. 완료될 때까지 기다려 주세요.");
      return;
    }

    if (
      !confirm(
        "재고수불부 봇 동기화를 실행할까요?\n\n· 조회 기간: 전월 1일 ~ 오늘 (전체 품목)\n· 생산불출/창고이동포함 체크 후 검색\n· 약 2~5분 소요 (데이터 양에 따라 다름)\n· 2년치 등 과거 데이터는 「수불부 엑셀 업로드」로 직접 올려주세요"
      )
    )
      return;

    setSyncingLedger(true);
    setLedgerBotWatchPhase("watching");
    setLedgerBotStatusLine("GitHub 재고수불부 봇 시작 요청 중…");
    resetBotProgress(ledgerProgressMaxRef, setLedgerBotProgressPercent, setLedgerBotStepLabel);
    ledgerFinishedRef.current = false;
    bumpProgressFloor(1, ledgerProgressMaxRef, setLedgerBotProgressPercent);
    setLedgerBotStepLabel("재고수불부 봇 시작 요청 중…");
    ledgerBaselineRef.current = ledgerLastSyncedAt;
    ledgerTriggeredAtRef.current = new Date().toISOString();

    await refreshLedgerStatus();

    try {
      const res = await fetch("/api/sync-inventory/ledger", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setLedgerBotStatusLine("GitHub Actions에서 재고수불부 일괄 동기화 중…");
      } else {
        setLedgerBotWatchPhase("failed");
        setLedgerBotStatusLine(data.message || "봇 시작 실패");
        alert(data.message || "재고수불부 동기화 시작에 실패했습니다.");
      }
    } catch (err: unknown) {
      setLedgerBotWatchPhase("failed");
      setLedgerBotStatusLine("봇 트리거 통신 오류");
    } finally {
      setSyncingLedger(false);
    }
  };

  const handleLedgerUploadClick = () => {
    if (!canEdit) {
      alert("수불부 엑셀 업로드는 수정 권한이 필요합니다.");
      return;
    }
    ledgerFileInputRef.current?.click();
  };

  const handleLedgerFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList?.length) return;

    const files = Array.from(fileList);
    if (
      !confirm(
        `재고수불부 엑셀 ${files.length}개를 업로드할까요?\n\n✓ 올바른 파일: 이카ount → 출력물 → 「재고수불부」 → Excel\n  (일자·거래처명·적요·입고·출고 컬럼)\n\n✗ 안 되는 파일: 「재고현황」 엑셀 (품목코드·품목명·재고수량만 있는 것)\n\n· 품목별 기존 수불부는 파일 내용으로 교체됩니다\n· 여러 파일은 한 번에 선택 권장`
      )
    ) {
      e.target.value = "";
      return;
    }

    setUploadingLedger(true);

    try {
      setLedgerBotStatusLine("엑셀 파일 분석 중…");
      const { items, errors: parseErrors } = await parseLedgerFilesOnClient(files);

      if (items.length === 0) {
        alert(parseErrors.join("\n") || "파싱된 수불부 데이터가 없습니다.");
        return;
      }

      setLedgerBotStatusLine(`DB 반영 중… (${items.length}품목)`);

      const res = await fetch("/api/inventory/ledger/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, file_count: files.length }),
      });
      const data = await parseUploadResponse(res);

      if (data.success) {
        const warn =
          data.errors?.length || parseErrors.length
            ? `\n\n일부 경고:\n${[...parseErrors, ...(data.errors || [])].slice(0, 5).join("\n")}`
            : "";
        alert(`${data.message || "업로드 완료"}${warn}`);
        await refreshLedgerStatus();
        setLedgerBotStatusLine("");
      } else {
        alert(data.message || "수불부 엑셀 업로드에 실패했습니다.");
        setLedgerBotStatusLine("");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "업로드 중 오류");
      setLedgerBotStatusLine("");
    } finally {
      setUploadingLedger(false);
      e.target.value = "";
    }
  };

  useEffect(() => {
    const today = new Date();
    const formattedDate = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    setCurrentDate(formattedDate);
    // 로컬 캐시 즉시 반영 (화면 먼저 보여주기)
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("beansheal_safety_configs");
      if (cached) { try { setSafetyConfigs(JSON.parse(cached)); } catch {} }
    }
    fetchAll();
  }, []);

  // 모든 DB 쿼리를 병렬(Promise.all)로 한 번에 요청 → 총 왕복 1회로 단축
  const fetchAll = async () => {
    setLoadingInv(true);
    try {
      const [
        inventoryRes,
        scrapedRes,
        safetyRes,
      ] = await Promise.all([
        supabase
          .from('ecount_items')
          .select('prod_cd, prod_nm, total_qty, last_synced_at')
          .order('prod_cd', { ascending: true }),
        supabase
          .from('ecount_inventory')
          .select('item_name, lot_no, expiry_date, quantity')
          .gt('quantity', 0)
          .order('created_at', { ascending: false })
          .limit(5000),
        getSafetyStockConfigs(),
      ]);

      // 재고 마스터
      if (!inventoryRes.error && inventoryRes.data) {
        setInventory(inventoryRes.data.map((item: any) => ({
          prodCd: item.prod_cd,
          prodNm: item.prod_nm,
          qty: item.total_qty || 0,
        })));
        const latest = inventoryRes.data
          .map((item: any) => item.last_synced_at as string | null)
          .filter(Boolean)
          .sort()
          .pop();
        if (latest) setLastSyncedAt(latest);
        setItemCount(inventoryRes.data.length);
      }

      // 로트 데이터
      if (!scrapedRes.error && scrapedRes.data) {
        setScrapedItems(scrapedRes.data.map((item: any) => ({
          productName: item.item_name,
          lotNo: item.lot_no,
          expDate: item.expiry_date || "-",
          qty: item.quantity,
        })));
      }

      // 안전재고 설정
      if (safetyRes.success && safetyRes.data) {
        setSafetyConfigs(safetyRes.data);
        if (typeof window !== "undefined") {
          localStorage.setItem("beansheal_safety_configs", JSON.stringify(safetyRes.data));
        }
      }
    } catch (e) {
      console.error("DB 재고 현황 로딩 에러:", e);
    } finally {
      setLoadingInv(false);
    }
  };

  const fetchInventory = fetchAll;

  useEffect(() => {
    refreshSyncStatus();
    refreshLedgerStatus();
    const timer = setInterval(() => {
      refreshSyncStatus();
      refreshLedgerStatus();
    }, 15000);
    return () => clearInterval(timer);
  }, [refreshSyncStatus, refreshLedgerStatus]);

  useEffect(() => {
    if (botWatchPhase !== "watching") return;
    const timer = setInterval(() => {
      setBotProgressPercent((prev) => {
        const target = botProgressMaxRef.current;
        if (prev >= target) return prev;
        return prev + 1;
      });
    }, 400);
    return () => clearInterval(timer);
  }, [botWatchPhase]);

  useEffect(() => {
    if (ledgerBotWatchPhase !== "watching") return;
    const timer = setInterval(() => {
      setLedgerBotProgressPercent((prev) => {
        const target = ledgerProgressMaxRef.current;
        if (prev >= target) return prev;
        return prev + 1;
      });
    }, 400);
    return () => clearInterval(timer);
  }, [ledgerBotWatchPhase]);

  useEffect(() => {
    if (botWatchPhase !== "watching") return;

    const started = Date.now();
    const maxMs = 5 * 60 * 1000;

    const poll = async () => {
      if (botFinishedRef.current) return;

      const data = await refreshSyncStatus();
      if (!data) return;

      const triggeredAt = botTriggeredAtRef.current || new Date().toISOString();
      const baseline = botBaselineRef.current;
      const elapsed = Date.now() - started;

      if (isSyncNewerThan(data.last_synced_at, baseline, triggeredAt)) {
        botFinishedRef.current = true;
        bumpProgressFloor(100, botProgressMaxRef, setBotProgressPercent);
        setBotStepLabel("동기화 완료");
        setBotStatusLine("재고 봇 동기화가 완료되었습니다.");
        setLastSyncedAt(data.last_synced_at);
        setItemCount(data.item_count);
        fetchInventory();
        setTimeout(() => {
          setBotWatchPhase("idle");
          setBotStatusLine("");
          resetBotProgress(botProgressMaxRef, setBotProgressPercent, setBotStepLabel);
        }, 2000);
        return;
      }

      const run = data.github_run;
      const runForThisTrigger =
        run && isGithubRunFromTrigger(run, triggeredAt) ? run : null;

      const timeFloor = estimateWatchProgress(elapsed, "stock");
      const serverFloor = runForThisTrigger ? (data.github_progress?.percent ?? 0) : 0;
      bumpProgressFloor(Math.max(timeFloor, serverFloor), botProgressMaxRef, setBotProgressPercent);

      if (runForThisTrigger?.status === "completed" && runForThisTrigger.conclusion === "failure") {
        setBotWatchPhase("failed");
        setBotStatusLine("GitHub 재고 봇 실패 — Actions 로그를 확인하세요");
        setBotStepLabel("재고 봇 실패");
        bumpProgressFloor(100, botProgressMaxRef, setBotProgressPercent);
        return;
      }

      if (runForThisTrigger?.status === "completed" && runForThisTrigger.conclusion === "success") {
        setBotStatusLine(`${formatGithubRunLabel(runForThisTrigger)} · DB 반영 대기 중…`);
        bumpProgressFloor(data.github_progress?.percent ?? 95, botProgressMaxRef, setBotProgressPercent);
        setBotStepLabel(data.github_progress?.step_label || "DB 반영 대기 중…");
      } else if (
        runForThisTrigger?.status === "in_progress" ||
        runForThisTrigger?.status === "queued"
      ) {
        setBotStatusLine(`${formatGithubRunLabel(runForThisTrigger)} · Ecount 로그인 → 재고 엑셀 다운로드 중…`);
        setBotStepLabel(data.github_progress?.step_label || "Ecount 로그인 → 재고 엑셀 다운로드 중…");
      } else {
        const warm = estimateTriggerProgress(elapsed, "stock");
        setBotStatusLine("재고 봇 실행 중… GitHub Actions 상태 확인 중 (5초마다)");
        setBotStepLabel(warm.step_label);
      }

      if (Date.now() - started > maxMs) {
        setBotWatchPhase("timeout");
        setBotStatusLine("5분 내 동기화 갱신 없음 — GitHub Actions에서 결과를 확인하세요");
        setBotStepLabel("동기화 시간 갱신 없음");
        bumpProgressFloor(Math.max(botProgressMaxRef.current, 95), botProgressMaxRef, setBotProgressPercent);
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [botWatchPhase, refreshSyncStatus]);

  useEffect(() => {
    if (ledgerBotWatchPhase !== "watching") return;

    const started = Date.now();
    const maxMs = 120 * 60 * 1000;

    const poll = async () => {
      if (ledgerFinishedRef.current) return;

      const data = await refreshLedgerStatus();
      if (!data) return;

      const triggeredAt = ledgerTriggeredAtRef.current || new Date().toISOString();
      const baseline = ledgerBaselineRef.current;
      const elapsed = Date.now() - started;

      if (isSyncNewerThan(data.last_synced_at, baseline, triggeredAt)) {
        ledgerFinishedRef.current = true;
        bumpProgressFloor(100, ledgerProgressMaxRef, setLedgerBotProgressPercent);
        setLedgerBotStepLabel("동기화 완료");
        setLedgerBotStatusLine("수불부 봇 동기화가 완료되었습니다.");
        setLedgerLastSyncedAt(data.last_synced_at);
        setLedgerSyncedCount(data.synced_item_count);
        fetchInventory();
        setTimeout(() => {
          setLedgerBotWatchPhase("idle");
          setLedgerBotStatusLine("");
          resetBotProgress(ledgerProgressMaxRef, setLedgerBotProgressPercent, setLedgerBotStepLabel);
        }, 2000);
        return;
      }

      const run = data.github_run;
      const runForThisTrigger =
        run && isGithubRunFromTrigger(run, triggeredAt) ? run : null;

      const timeFloor = estimateWatchProgress(elapsed, "ledger_bulk");
      const serverFloor = runForThisTrigger ? (data.github_progress?.percent ?? 0) : 0;
      bumpProgressFloor(
        Math.max(timeFloor, serverFloor),
        ledgerProgressMaxRef,
        setLedgerBotProgressPercent
      );

      if (runForThisTrigger?.status === "completed" && runForThisTrigger.conclusion === "failure") {
        setLedgerBotWatchPhase("failed");
        setLedgerBotStatusLine("수불부 봇 실패 — Actions 로그 확인");
        setLedgerBotStepLabel("수불부 봇 실패");
        bumpProgressFloor(100, ledgerProgressMaxRef, setLedgerBotProgressPercent);
        return;
      }

      if (runForThisTrigger?.status === "in_progress" || runForThisTrigger?.status === "queued") {
        setLedgerBotStatusLine(`${formatGithubRunLabel(runForThisTrigger)} · 수불부 엑셀 다운로드·업로드 중…`);
        setLedgerBotStepLabel(data.github_progress?.step_label || "수불부 엑셀 다운로드·업로드 중…");
      } else if (runForThisTrigger?.status === "completed" && runForThisTrigger.conclusion === "success") {
        setLedgerBotStatusLine(`${formatGithubRunLabel(runForThisTrigger)} · DB 반영 대기 중…`);
        bumpProgressFloor(data.github_progress?.percent ?? 95, ledgerProgressMaxRef, setLedgerBotProgressPercent);
        setLedgerBotStepLabel(data.github_progress?.step_label || "DB 반영 대기 중…");
      } else {
        const warm = estimateTriggerProgress(elapsed, "ledger_bulk");
        setLedgerBotStatusLine("수불부 봇 실행 중… GitHub Actions 상태 확인 중 (5초마다)");
        setLedgerBotStepLabel(warm.step_label);
      }

      if (Date.now() - started > maxMs) {
        setLedgerBotWatchPhase("timeout");
        setLedgerBotStatusLine("2시간 내 완료 신호 없음 — GitHub Actions에서 진행 상황을 확인하세요");
        setLedgerBotStepLabel("완료 신호 없음");
        bumpProgressFloor(Math.max(ledgerProgressMaxRef.current, 95), ledgerProgressMaxRef, setLedgerBotProgressPercent);
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [ledgerBotWatchPhase, refreshLedgerStatus]);

  // [수정] 검색어, 수량 0 숨기기, 안전재고 미달 필터링 동시 적용
  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.prodNm.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.prodCd.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesQty = hideZeroQty ? item.qty > 0 : true;

    const minQty = safetyConfigs[item.prodCd] ?? getDefaultSafetyQty(item.prodNm);
    const isLowStock = checkIsLowStock(item.qty, minQty);
    const matchesLowStock = showOnlyLowStock ? isLowStock : true;

    return matchesSearch && matchesQty && matchesLowStock;
  });

  const normalizeName = (name: string) => {
    if (!name) return "";
    return name
      .replace(/^[원부자반]\)\s*/, '') 
      .replace(/\[.*?\]/g, '')        
      .replace(/\s+/g, '')            
      .toLowerCase();                 
  };

  const getInventoryBreakdown = (prodNm: string, totalQtyStr: string | number) => {
    const totalQty = Number(String(totalQtyStr).replace(/,/g, ''));
    const targetCleanName = normalizeName(prodNm);

    const rawLots = scrapedItems.filter(lot => normalizeName(lot.productName) === targetCleanName);

    const uniqueLotsMap = new Map();
    rawLots.forEach(lot => {
      const lotKey = String(lot.lotNo || '').trim();
      if (!uniqueLotsMap.has(lotKey)) {
        uniqueLotsMap.set(lotKey, { ...lot, qty: Number(String(lot.qty).replace(/,/g, '')) });
      }
    });

    let matchingLots = Array.from(uniqueLotsMap.values()).sort((a, b) => {
      const lotA = String(a.lotNo || '').trim();
      const lotB = String(b.lotNo || '').trim();
      return lotA.localeCompare(lotB);
    });
    
    let neededQty = totalQty;
    let finalLots = [];

    for (let i = 0; i < matchingLots.length; i++) {
      if (neededQty <= 0) break; 
      
      const lot = matchingLots[i];
      if (lot.qty <= neededQty) {
        finalLots.push(lot);
        neededQty = Math.round((neededQty - lot.qty) * 1000) / 1000;
      } else {
        finalLots.push({ ...lot, qty: neededQty });
        neededQty = 0;
      }
    }

    const unassignedQty = Math.max(Math.round(neededQty * 1000) / 1000, 0); 

    return { totalQty, matchingLots: finalLots, unassignedQty };
  };

  const formatLotColumn = (lots: { lotNo: string }[]): string => {
    const nums = lots.map((l) => String(l.lotNo || "").trim()).filter(Boolean);
    if (nums.length === 0) return "—";
    if (nums.length <= 2) return nums.join(", ");
    return `${nums[0]} 외 ${nums.length - 1}건`;
  };

  const openLedgerModal = async (prodCd: string, prodNm: string) => {
    setLedgerModal({
      prodCd,
      prodNm,
      loading: true,
      syncing: false,
      rows: [],
      periodLabel: "",
      error: "",
    });

    try {
      const getRes = await fetch(
        `/api/inventory/ledger?prod_cd=${encodeURIComponent(prodCd)}&prod_nm=${encodeURIComponent(prodNm)}`,
        {
        cache: "no-store",
      });
      const getData = await getRes.json();

      if (getData.success && getData.has_data) {
        const p = getData.planned_period;
        setLedgerModal({
          prodCd,
          prodNm,
          loading: false,
          syncing: false,
          rows: getData.rows,
          periodLabel: p ? `${p.from} ~ ${p.to}` : getData.meta?.period_from ? `${getData.meta.period_from} ~ ${getData.meta.period_to}` : "",
          error: "",
        });
        return;
      }

      setLedgerModal({
        prodCd,
        prodNm,
        loading: false,
        syncing: false,
        rows: [],
        periodLabel: getData.planned_period ? `${getData.planned_period.from} ~ ${getData.planned_period.to}` : "",
        error:
          ledgerBotWatchPhase === "watching"
            ? "재고수불부 일괄 동기화가 진행 중입니다. 완료 후 다시 열어주세요."
            : "수불부 데이터가 없습니다. 상단 「수불부 봇 동기화」 버튼을 먼저 실행하세요.",
      });
    } catch (e) {
      setLedgerModal({
        prodCd,
        prodNm,
        loading: false,
        syncing: false,
        rows: [],
        periodLabel: "",
        error: e instanceof Error ? e.message : "재고수불부 조회 오류",
      });
    }
  };

  const closeLedgerModal = () => {
    setLedgerModal(null);
  };

  const renderItemNameButton = (prodCd: string, prodNm: string) => {
    const label = prodNm && prodNm !== prodCd ? prodNm : "(품목명 미지정)";
    return (
      <button
        type="button"
        onClick={() => openLedgerModal(prodCd, prodNm)}
        className={`text-left hover:underline hover:text-blue-700 cursor-pointer truncate max-w-full ${
          prodNm && prodNm !== prodCd ? "font-bold text-gray-900" : "text-amber-800 text-xs font-normal italic"
        }`}
        title="재고수불부 보기"
      >
        {label}
      </button>
    );
  };

  return (
    <div className="max-w-[1920px] mx-auto py-6 sm:py-8 md:py-10 px-2 sm:px-4 bg-[#f8f9fb] min-h-screen">
      
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">재고현황</h1>
              {!canEdit && (
                <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded border border-amber-200 shadow-2xs">
                  🔒 자재물류 부서 사원만 수정 가능 (조회 전용)
                </span>
              )}
            </div>
          </div>
          {isSuperAdmin && (
            <Link
              href="/admin/ecount-bot"
              className="shrink-0 text-xs sm:text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
            >
              봇 설정
            </Link>
          )}
        </div>
        <div className="text-center sm:text-left mb-4 space-y-2">
          <p className="text-sm text-slate-600">
            마지막 동기화:{" "}
            <span className="font-semibold text-slate-800">{formatLastSyncedAt(lastSyncedAt)}</span>
            <span className="text-slate-400 mx-2">·</span>
            <span className="text-slate-600">{itemCount.toLocaleString("ko-KR")}건</span>
            <span className="ml-2 text-[11px] text-slate-400">(15초마다 자동 갱신)</span>
          </p>
          <p className="text-sm text-slate-600">
            수불부 동기화:{" "}
            <span className="font-semibold text-slate-800">{formatLastSyncedAt(ledgerLastSyncedAt)}</span>
            <span className="text-slate-400 mx-2">·</span>
            <span className="text-slate-600">{ledgerSyncedCount.toLocaleString("ko-KR")}품목</span>
            <span className="ml-2 text-[11px] text-slate-400">봇=전월~오늘 · 과거=엑셀 업로드</span>
          </p>

          <BotSyncProgressBanner
            phase={botWatchPhase}
            statusLine={botStatusLine}
            stepLabel={botStepLabel}
            percent={botProgressPercent}
            githubActionsUrl={githubActionsUrl}
            tone="blue"
          />

          <BotSyncProgressBanner
            phase={ledgerBotWatchPhase}
            statusLine={ledgerBotStatusLine}
            stepLabel={ledgerBotStepLabel}
            percent={ledgerBotProgressPercent}
            githubActionsUrl={githubActionsUrl}
            tone="violet"
          />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end mb-2">
          
          {/* [신규 UI] 수량 0 숨기기 & 안전재고 미달만 보기 체크박스 영역 */}
          <div className="flex items-center gap-4">
            <label className="flex items-center cursor-pointer hover:opacity-80 transition-opacity">
              <input 
                type="checkbox" 
                checked={hideZeroQty}
                onChange={(e) => setHideZeroQty(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
              />
              <span className="ml-2 text-sm font-medium text-gray-700 select-none">
                수량 0 숨기기
              </span>
            </label>

            <label className="flex items-center cursor-pointer hover:opacity-80 transition-opacity">
              <input 
                type="checkbox" 
                checked={showOnlyLowStock}
                onChange={(e) => setShowOnlyLowStock(e.target.checked)}
                className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500 cursor-pointer"
              />
              <span className="ml-2 text-sm font-bold text-amber-800 select-none">
                안전재고 미달만 보기
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-auto order-1">
              <input
                type="text"
                placeholder="품목명/코드 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border-2 border-blue-500 text-gray-900 bg-white placeholder-gray-300 px-3 py-1.5 text-sm w-full sm:w-64 focus:outline-none focus:border-blue-600 shadow-sm"
              />
            </div>
            
            <button 
              onClick={fetchInventory} 
              disabled={loadingInv} 
              className="text-sm text-gray-700 bg-gray-100 border border-gray-300 px-4 py-1.5 hover:bg-gray-200 cursor-pointer order-2"
            >
              {loadingInv ? "조회중..." : "조회"}
            </button>


            {/* 모바일: 추가 작업 접이식 메뉴 */}
            <details className="md:hidden w-full order-4">
              <summary className="text-sm font-bold text-gray-700 bg-gray-100 border border-gray-300 px-4 py-2 cursor-pointer list-none flex items-center justify-between">
                추가 작업
                <span className="text-xs text-gray-400">▼</span>
              </summary>
              <div className="mt-2 flex flex-col gap-2 p-2 bg-white border border-gray-200 rounded-lg">
                <button
                  onClick={handleSyncMaster}
                  disabled={botSyncInProgress}
                  className="text-sm font-bold text-blue-700 bg-blue-50 border border-blue-300 px-4 py-2 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={botSyncInProgress ? "GitHub Actions에서 봇 실행 중" : undefined}
                >
                  {syncingMaster || botWatchPhase === "watching" ? "재고 봇 실행 중…" : "재고 봇 동기화"}
                </button>
                <button
                  onClick={handleSyncLedger}
                  disabled={botSyncInProgress}
                  className="text-sm font-bold text-violet-800 bg-violet-50 border border-violet-300 px-4 py-2 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={botSyncInProgress ? "GitHub Actions에서 봇 실행 중" : undefined}
                >
                  {syncingLedger || ledgerBotWatchPhase === "watching" ? "수불부 봇 실행 중…" : "수불부 봇 동기화"}
                </button>
                {canEdit && (
                  <button
                    onClick={handleLedgerUploadClick}
                    disabled={botSyncInProgress}
                    className="text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-4 py-2 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploadingLedger ? "수불부 엑셀 업로드 중…" : "수불부 엑셀 업로드"}
                  </button>
                )}
                {isSuperAdmin && (
                  <button
                    onClick={handleClearAllInventory}
                    disabled={loadingInv}
                    className="text-sm font-bold text-rose-800 bg-rose-50 border border-rose-300 px-4 py-2 hover:bg-rose-100 disabled:opacity-50"
                  >
                    재고현황 전체 삭제
                  </button>
                )}
              </div>
            </details>


            <button
              onClick={handleSyncMaster}
              disabled={botSyncInProgress}
              className="hidden md:inline-flex text-sm font-bold text-blue-700 bg-blue-50 border border-blue-300 px-4 py-1.5 hover:bg-blue-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
              title={botSyncInProgress ? "GitHub Actions에서 봇 실행 중" : undefined}
            >
              {syncingMaster || botWatchPhase === "watching" ? "재고 봇 실행 중…" : "재고 봇 동기화"}
            </button>

            <button
              onClick={handleSyncLedger}
              disabled={botSyncInProgress}
              className="hidden md:inline-flex text-sm font-bold text-violet-800 bg-violet-50 border border-violet-300 px-4 py-1.5 hover:bg-violet-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
              title="전월~오늘 재고수불부 자동 동기화"
            >
              {syncingLedger || ledgerBotWatchPhase === "watching" ? "수불부 봇 실행 중…" : "수불부 봇 동기화"}
            </button>

            {canEdit && (
              <button
                onClick={handleLedgerUploadClick}
                disabled={botSyncInProgress}
                className="hidden md:inline-flex text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-4 py-1.5 hover:bg-emerald-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
                title="이카ount 출력물 → 재고수불부 화면에서 받은 xlsx (재고현황 엑셀 아님)"
              >
                {uploadingLedger ? "수불부 엑셀 업로드 중…" : "수불부 엑셀 업로드"}
              </button>
            )}

            {isSuperAdmin && (
              <button
                onClick={handleClearAllInventory}
                disabled={loadingInv}
                className="hidden md:inline-flex text-sm font-bold text-rose-800 bg-rose-50 border border-rose-300 px-4 py-1.5 hover:bg-rose-100 cursor-pointer disabled:opacity-50 shadow-2xs"
                title="ecount_items 재고 마스터 전량 삭제 (전체관리자)"
              >
                재고현황 전체 삭제
              </button>
            )}
            
            <span className="text-sm text-gray-800 font-mono w-full sm:w-auto sm:ml-2 order-5">{currentDate}</span>
          </div>
        </div>
      </div>

      {/* 재고수불부 엑셀 업로드 (숨김 input) */}
      <input
        ref={ledgerFileInputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        multiple
        className="hidden"
        onChange={handleLedgerFilesSelected}
      />

      {/* 모바일 카드 목록 */}
      <div className="md:hidden space-y-3 mb-4">
        {filteredInventory.map((item, idx) => {
          const breakdown = getInventoryBreakdown(item.prodNm, item.qty);
          const minQty = safetyConfigs[item.prodCd] ?? getDefaultSafetyQty(item.prodNm);
          const isLowStock = checkIsLowStock(breakdown.totalQty, minQty);

          return (
            <article
              key={`mobile-${idx}`}
              className={`bg-white border rounded-xl p-4 shadow-sm ${isLowStock ? "border-amber-300 bg-amber-50/40" : "border-gray-300"}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="font-mono text-xs text-slate-800 font-bold">{item.prodCd}</span>
                {isLowStock && (
                  <span className="px-2 py-0.5 bg-amber-600 text-white rounded text-[10px] font-extrabold shrink-0">
                    안전재고 미달
                  </span>
                )}
              </div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  {renderItemNameButton(item.prodCd, item.prodNm)}
                </div>
                <p className="font-extrabold text-lg text-gray-900 shrink-0">{formatQty(breakdown.totalQty)}</p>
              </div>
              <div className="flex items-center justify-between text-xs border-t border-gray-100 pt-2 gap-2">
                <span className="text-gray-500 shrink-0">
                  시리얼/로트:{" "}
                  <span className="font-mono font-bold text-slate-700">{formatLotColumn(breakdown.matchingLots)}</span>
                </span>
                <span className="text-gray-500 shrink-0">
                  안전재고: <span className="font-mono font-bold">{formatQty(minQty)}</span>
                </span>
              </div>
            </article>
          );
        })}
        {filteredInventory.length === 0 && !loadingInv && (
          <p className="text-center py-10 text-gray-500 text-sm">조회된 데이터가 없습니다.</p>
        )}
      </div>

      <div className="hidden md:block overflow-x-auto bg-[#f8f9fb]">
        <table className="w-full text-sm border-collapse border border-gray-300 table-fixed bg-[#f8f9fb]">
          
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[30%]" />
            <col className="w-[18%]" />
            <col className="w-[15%]" />
            <col className="w-[25%]" />
          </colgroup>

          <thead>
            <tr className="bg-[#f0f2f5]">
              <th className="border border-gray-300 py-2 text-center text-[#203366] font-bold text-[13px]">
                품목코드 <span className="text-[10px]">▼</span>
              </th>
              <th className="border border-gray-300 py-2 text-center text-[#203366] font-bold text-[13px]">
                품목명[규격] <span className="text-[10px]">▼</span>
              </th>
              <th className="border border-gray-300 py-2 text-center text-[#203366] font-bold text-[13px]">
                시리얼/로트
              </th>
              <th className="border border-gray-300 py-2 text-center text-[#203366] font-bold text-[13px]">
                재고수량 <span className="text-[10px]">▼</span>
              </th>
              <th className="border border-gray-300 py-2 text-center text-[#203366] font-bold text-[13px]">
                안전재고 기준 / 상태
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.map((item, idx) => {
              const breakdown = getInventoryBreakdown(item.prodNm, item.qty);
              const minQty = safetyConfigs[item.prodCd] ?? getDefaultSafetyQty(item.prodNm);
              const isLowStock = checkIsLowStock(breakdown.totalQty, minQty);

              return (
                <tr
                  key={`row-${idx}`}
                  className={`bg-[#f8f9fb] transition-colors ${isLowStock ? "bg-amber-50/70 hover:bg-amber-100/80" : "hover:bg-yellow-50"}`}
                >
                  <td className="border border-gray-300 px-2 py-1.5 text-[#203366] font-medium text-[13px] whitespace-nowrap overflow-hidden text-ellipsis text-center">
                    {item.prodCd}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-[13px] whitespace-nowrap overflow-hidden text-ellipsis">
                    {renderItemNameButton(item.prodCd, item.prodNm)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center text-xs font-mono text-slate-700">
                    {formatLotColumn(breakdown.matchingLots)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right font-bold text-[13px] text-gray-900">
                    {formatQty(breakdown.totalQty)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center text-xs font-medium">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="font-mono font-bold text-gray-700">{formatQty(minQty)}</span>
                      {isLowStock && (
                        <span className="px-1.5 py-0.5 bg-amber-600 text-white rounded text-[10px] font-extrabold animate-pulse">
                          미달
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            
            {filteredInventory.length === 0 && !loadingInv && (
              <tr>
                <td colSpan={5} className="border border-gray-300 bg-[#f8f9fb] text-center py-10 text-gray-500 text-sm">
                  조회된 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 이카운트 수신 원본 JSON 로그 모달 (고객센터 전달용) */}
      {rawLogModalData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex justify-between items-center shrink-0">
              <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                <span>{rawLogModalData.title}</span>
              </h3>
              <button
                type="button"
                onClick={() => setRawLogModalData(null)}
                className="text-slate-400 hover:text-white font-bold text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="bg-red-50 border border-red-200 text-red-900 p-3 rounded-lg font-bold">
                {rawLogModalData.error}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-extrabold text-slate-700">이카운트 서버 수신 원본 JSON 응답 (Raw Response):</label>
                  <button
                    type="button"
                    onClick={() => {
                      const text = JSON.stringify(rawLogModalData.rawResponse, null, 2);
                      navigator.clipboard.writeText(text);
                      alert("이카운트 수신 원본 JSON 로그가 클립보드에 복사되었습니다!");
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-xs font-extrabold cursor-pointer transition-colors shadow-2xs"
                  >
                    JSON 로그 1클릭 복사
                  </button>
                </div>

                <pre className="bg-slate-950 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-[350px] leading-relaxed border border-slate-800 select-all">
                  {JSON.stringify(rawLogModalData.rawResponse, null, 2)}
                </pre>
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200 font-medium">
                💡 <strong>안내:</strong> 상단 <code>JSON 로그 1클릭 복사</code> 버튼을 클릭하신 후, 이카운트 고객센터 문의에 그대로 붙여넣기(Ctrl+V) 하시면 이카운트 기술팀에서 즉시 원인을 분석해 드립니다.
              </div>
            </div>

            <div className="bg-gray-50 border-t border-gray-200 px-5 py-3 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setRawLogModalData(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs rounded-lg cursor-pointer"
              >
                확인 / 닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {ledgerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-[#f0f2f5]">
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-extrabold text-[#203366]">재고수불부</h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5 truncate">
                  {ledgerModal.prodNm} ({ledgerModal.prodCd})
                </p>
                {ledgerModal.periodLabel && (
                  <p className="text-[11px] text-slate-500 mt-1">기간: {ledgerModal.periodLabel}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeLedgerModal}
                className="shrink-0 text-gray-400 hover:text-gray-800 p-1 rounded cursor-pointer"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto p-2 sm:p-4">
              {(ledgerModal.loading || ledgerModal.syncing) && (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-blue-700">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  {ledgerModal.loading ? "불러오는 중…" : "GitHub 봇으로 재고수불부 동기화 중… (최대 3분)"}
                </div>
              )}

              {ledgerModal.error && !ledgerModal.loading && (
                <p className="text-center text-sm text-rose-700 py-8">{ledgerModal.error}</p>
              )}

              {!ledgerModal.loading && !ledgerModal.syncing && ledgerModal.rows.length > 0 && (
                <table className="w-full text-xs sm:text-sm border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-[#f0f2f5]">
                      <th className="border border-gray-300 px-2 py-1.5 text-[#203366] font-bold">일자</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-[#203366] font-bold">거래처명</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-[#203366] font-bold">적요</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-[#203366] font-bold">입고</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-[#203366] font-bold">출고</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-[#203366] font-bold">재고</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-[#203366] font-bold">시험번호</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerModal.rows.map((row) => {
                      const isOpening = row.row_kind === "opening";
                      const isTotal = row.row_kind === "total" || row.row_kind === "subtotal";
                      return (
                        <tr
                          key={row.id}
                          className={
                            isOpening
                              ? "bg-rose-50/60 text-rose-900"
                              : isTotal
                                ? "bg-slate-100 font-bold"
                                : "hover:bg-yellow-50/50"
                          }
                        >
                          <td className="border border-gray-300 px-2 py-1 whitespace-nowrap">{row.txn_date}</td>
                          <td className="border border-gray-300 px-2 py-1">{row.partner_name}</td>
                          <td className="border border-gray-300 px-2 py-1">{row.remarks}</td>
                          <td className="border border-gray-300 px-2 py-1 text-right font-mono">
                            {row.in_qty ? formatQty(row.in_qty) : ""}
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-right font-mono">
                            {row.out_qty ? formatQty(row.out_qty) : ""}
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-right font-mono font-bold">
                            {row.balance_qty !== null ? formatQty(row.balance_qty) : ""}
                          </td>
                          <td className="border border-gray-300 px-2 py-1 font-mono text-center whitespace-pre-line leading-snug">
                            {(row.fifo_lot_no || row.lot_no || "").replace(/^—$/,"") || ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {!ledgerModal.loading && !ledgerModal.syncing && !ledgerModal.error && ledgerModal.rows.length === 0 && (
                <p className="text-center text-sm text-gray-500 py-12">해당 기간 수불 내역이 없습니다.</p>
              )}
            </div>

            <div className="border-t border-gray-200 px-4 py-3 flex justify-end gap-2 bg-gray-50">
              <button
                type="button"
                onClick={() => ledgerModal && openLedgerModal(ledgerModal.prodCd, ledgerModal.prodNm)}
                disabled={ledgerModal.loading}
                className="text-xs font-bold text-blue-700 border border-blue-300 bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100 disabled:opacity-50 cursor-pointer"
              >
                다시 불러오기
              </button>
              <button
                type="button"
                onClick={closeLedgerModal}
                className="text-xs font-bold text-white bg-slate-800 px-4 py-1.5 rounded hover:bg-slate-900 cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}