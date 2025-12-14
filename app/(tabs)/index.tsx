import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import axios from "axios";
import { API_BASE } from "../../constants/api";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";


const TABS = ["Daily", "Monthly", "Calendar", "Total"];

// -------- Helpers --------

function groupByDay(transactions: any[]) {
  const groups: Record<
    string,
    { date: string; income: number; expense: number; list: any[] }
  > = {};

  transactions.forEach((tx) => {
    if (!tx.timestamp) return;
    const txDate = tx.timestamp.split("T")[0];

    if (!groups[txDate]) {
      groups[txDate] = {
        date: txDate,
        income: 0,
        expense: 0,
        list: [],
      };
    }

    // **Important**: keep the tx in the list (so transfers are visible),
    // but **do not** include transfers in income/expense sums.
    if (tx.source !== "transfer") {
      if (tx.amount > 0) groups[txDate].income += tx.amount;
      else groups[txDate].expense += Math.abs(tx.amount);
    }

    groups[txDate].list.push(tx);
  });

  return Object.values(groups).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

function groupByMonth(transactions: any[]) {
  const groups: Record<
    string,
    { key: string; income: number; expense: number; list: any[] }
  > = {};

  transactions.forEach((tx) => {
    if (!tx.timestamp) return;
    const datePart = tx.timestamp.split("T")[0];
    const [y, m] = datePart.split("-");
    const key = `${y}-${m}`; // e.g. "2025-11"

    if (!groups[key]) {
      groups[key] = {
        key,
        income: 0,
        expense: 0,
        list: [],
      };
    }

    // Exclude transfers from monthly income/expense totals,
    // but keep the tx in the list for display.
    if (tx.source !== "transfer") {
      if (tx.amount > 0) groups[key].income += tx.amount;
      else groups[key].expense += Math.abs(tx.amount);
    }

    groups[key].list.push(tx);
  });

  return Object.values(groups).sort(
    (a, b) =>
      new Date(b.key + "-01").getTime() - new Date(a.key + "-01").getTime()
  );
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatMonthFromKey(key: string) {
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function getCalendarMatrix(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const matrix: (number | null)[][] = [];
  let row: (number | null)[] = [];

  for (let i = 0; i < firstDay.getDay(); i++) row.push(null);

  for (let d = 1; d <= lastDay.getDate(); d++) {
    row.push(d);
    if (row.length === 7) {
      matrix.push(row);
      row = [];
    }
  }

  if (row.length > 0) {
    while (row.length < 7) row.push(null);
    matrix.push(row);
  }

  return matrix;
}

function getTodayDateString() {
  const d = new Date();
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

function getInitialMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// default account + currency for manual add (fallback)
const DEFAULT_ACCOUNT_ID = "69182ffce97e97a2a9e55fd8";
const DEFAULT_CURRENCY = "INR";

// preset categories (with emojis)
const EXPENSE_CATEGORIES = [
  "🍜Food",
  "💡Bills",
  "✈️Travel",
  "🛍️Shopping",
  "🏠House",
  "🎉Fun",
  "💊Health",
  "Others",
];

const INCOME_CATEGORIES = ["💸Salary", "💰Payback", "🫰🏻Profit", "💳Cashback", "Others"];

const ALL_CATEGORIES = Array.from(
  new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])
);

// -------- Main Component --------

export default function TransactionsScreen() {
  const [selectedTab, setSelectedTab] = useState("Daily");
  const [transactions, setTransactions] = useState<any[]>([]);

  const [month, setMonth] = useState(getInitialMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDateTx, setSelectedDateTx] = useState<any[]>([]);

  // Add Transaction modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [formType, setFormType] = useState<"expense" | "income">("expense");
  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState(getTodayDateString());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  type FilterMode = "none" | "account" | "category";

  const [filterMode, setFilterMode] = useState<FilterMode>("none");
  const [filterAccountId, setFilterAccountId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const accountMap = useMemo(() => {
    const map: Record<string, { name: string; type?: string; currency?: string }> = {};
    accounts.forEach((acc: any) => {
      if (acc.id) {
        map[acc.id] = {
          name: acc.name || "Unnamed",
          type: acc.type,
          currency: acc.currency,
        };
      }
    });
    return map;
  }, [accounts]);

  function formatMonthLabel(monthStr: string) {
    const [y, m] = monthStr.split("-");
    const date = new Date(Number(y), Number(m) - 1);
    return date.toLocaleString("en-US", { month: "long", year: "numeric" });
  }

  // -------- Fetch Data (all transactions) --------
  const fetchTransactions = () => {
    axios
      .get(`${API_BASE}/transactions`)
      .then((res) => {
        setTransactions(res.data || []);
      })
      .catch((err) => console.log("TX error", err));
  };

  const fetchAccounts = () => {
    axios
      .get(`${API_BASE}/accounts`)
      .then((res) => {
        setAccounts(res.data || []);
      })
      .catch((err) => console.log("Accounts error", err));
  };

  useEffect(() => {
    axios.get(`${API_BASE}/`);
  }, []);

  useEffect(() => {
    fetchTransactions();
    fetchAccounts();
  }, []);

  useEffect(() => {
    const fn = () => {
      fetchTransactions();
      fetchAccounts();
    };

    (globalThis as any).__refreshTransactions = fn;

    return () => {
      if ((globalThis as any).__refreshTransactions === fn) {
        (globalThis as any).__refreshTransactions = undefined;
      }
    };
  }, []);

  // default selected account once accounts are loaded
  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // -------- Derived data --------
  // #change-filter central filtered base
  const filteredTxBase = useMemo(() => {
    let base = transactions;

    if (filterMode === "account" && filterAccountId) {
      base = base.filter((tx) => tx.account_id === filterAccountId);
    }

    if (filterMode === "category" && filterCategory) {
      base = base.filter((tx) => tx.category === filterCategory);
    }

    return base;
  }, [transactions, filterMode, filterAccountId, filterCategory]);

  // #change-filter applied
  const currentMonthTx = useMemo(() => {
    const [y, m] = month.split("-");
    return filteredTxBase.filter((tx) => {
      if (!tx.timestamp) return false;
      const [dy, dm] = tx.timestamp.split("T")[0].split("-");
      return dy === y && dm === m;
    });
  }, [filteredTxBase, month]);

  const groupedDaily = useMemo(() => groupByDay(currentMonthTx), [currentMonthTx]);

  const calendarMatrix = useMemo(() => {
    const [y, m] = month.split("-");
    return getCalendarMatrix(Number(y), Number(m) - 1);
  }, [month]);

  const groupedMonthlyAll = useMemo(
    () => groupByMonth(filteredTxBase),
    [filteredTxBase]
  );

  const yearMonthlyGroups = useMemo(
    () => groupedMonthlyAll.filter((g) => g.key.startsWith(String(viewYear) + "-")),
    [groupedMonthlyAll, viewYear]
  );

  // Total tab: all transactions up to end of selected month
  const filteredTotalTx = useMemo(() => {
    const [y, m] = month.split("-");
    const endOfMonth = new Date(Number(y), Number(m), 0);

    return filteredTxBase.filter((tx) => {
      if (!tx.timestamp) return false;
      const d = new Date(tx.timestamp.split("T")[0]);
      return d.getTime() <= endOfMonth.getTime();
    });
  }, [filteredTxBase, month]);

  // summary row – depends on tab (Total uses filteredTotalTx)
  const { summaryIncome, summaryExpense, summaryTotal } = useMemo(() => {
    let inc = 0;
    let exp = 0;

    if (selectedTab === "Monthly") {
      // groupedMonthlyAll already excludes transfers when computing income/expense
      yearMonthlyGroups.forEach((g) => {
        inc += g.income;
        exp += g.expense;
      });
    } else if (selectedTab === "Total") {
      // make sure to skip transfers when summing totals
      filteredTotalTx.forEach((tx) => {
        if (tx.source === "transfer") return;
        if (tx.amount > 0) inc += tx.amount;
        else exp += Math.abs(tx.amount);
      });
    } else {
      // Daily (current month): skip transfers for sums
      currentMonthTx.forEach((tx) => {
        if (tx.source === "transfer") return;
        if (tx.amount > 0) inc += tx.amount;
        else exp += Math.abs(tx.amount);
      });
    }

    return { summaryIncome: inc, summaryExpense: exp, summaryTotal: inc - exp };
  }, [selectedTab, yearMonthlyGroups, filteredTotalTx, currentMonthTx]);

  // -------- Navigation helpers --------

  function prevMonth() {
    const [y, m] = month.split("-");
    const date = new Date(Number(y), Number(m) - 2);
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }

  function nextMonth() {
    const [y, m] = month.split("-");
    const date = new Date(Number(y), Number(m));
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }

  const prevYear = () => setViewYear((y) => y - 1);
  const nextYear = () => setViewYear((y) => y + 1);

  const currentCategories = formType === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  // -------- Transaction Card (reference-style layout) --------
  const TxItem = ({ item, showDate = false }: { item: any; showDate?: boolean }) => {
    const isDeleteMode = deleteCandidateId === item.id;

    let dateLabel = "";
    if (showDate && item.timestamp) {
      const d = new Date(item.timestamp);
      dateLabel = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
    }

    const isExpense = item.amount < 0;

    const accInfo = item.account_id ? accountMap[item.account_id] : undefined;

    const accountLabel = accInfo ? (accInfo.type ? `${accInfo.name}` : accInfo.name) : null;

    const handleLongPress = () => {
      // toggle delete mode for this card
      setDeleteCandidateId(isDeleteMode ? null : item.id);
    };

    const handlePress = () => {
      if (isDeleteMode) {
        // confirm delete
        handleDeleteTransaction(item.id);
      }
    };

    // If in delete mode, show red glassy delete state
    if (isDeleteMode) {
      return (
        <TouchableOpacity activeOpacity={0.9} onPress={handlePress} onLongPress={handleLongPress}>
          <View style={styles.cardWrapper}>
            <View style={[styles.cardAccent, styles.cardAccentDelete]} />
            <View style={[styles.card, styles.cardDelete]}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Ionicons name="trash" size={20} color="#fff" />
                <Text style={styles.deleteSub}>Tap again to confirm</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // Normal non-delete card
    return (
      <TouchableOpacity activeOpacity={0.8} onLongPress={handleLongPress} onPress={handlePress}>
        <View style={styles.cardWrapper}>
          <View style={[styles.cardAccent, { backgroundColor: isExpense ? "#fb7185" : "#34d399" }]} />
          <View style={styles.card}>
            {/* LEFT: Category (with emoji) */}
            <View style={styles.cardLeft}>
              <Text style={styles.category}>{item.category}</Text>
            </View>

            {/* MIDDLE: Description + account + optional date */}
            <View style={styles.cardCenter}>
              {item.description ? <Text style={styles.desc} numberOfLines={1}>{item.description}</Text> : <Text style={styles.descPlaceholder}>—</Text>}
              {accountLabel && <Text style={styles.accountLabel} numberOfLines={1}>{accountLabel}</Text>}
              {showDate && dateLabel ? <Text style={styles.cardDate}>{dateLabel}</Text> : null}
            </View>

            {/* RIGHT: Amount */}
            <View style={styles.cardRight}>
              <Text style={[styles.amount, { color: isExpense ? "#fb7185" : "#6ee7b7" }]}>₹{Math.abs(item.amount)}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // -------- Daily Renderer (with pill date header) --------
  const renderDailyGroup = ({ item }: { item: any }) => (
    <View style={{ marginBottom: 16 }}>
      <View style={styles.dayHeaderContainer}>
        <View style={styles.dayHeaderPill}>
          <Text style={styles.dayHeaderDateText}>{formatDay(item.date)}</Text>
        </View>
        <Text style={styles.dayAmount}>₹{(item.income - item.expense).toFixed(2)}</Text>
      </View>

      {item.list.map((tx: any) => (
        <TxItem key={tx.id} item={tx} />
      ))}
    </View>
  );

  // -------- Monthly Renderer (year-filtered) --------
  const renderMonthGroup = ({ item }: { item: any }) => (
    <View style={{ marginBottom: 18 }}>
      <View style={styles.monthGroupHeader}>
        <View style={styles.monthGroupPill}>
          <Text style={styles.monthGroupText}>{formatMonthFromKey(item.key)}</Text>
        </View>
        <Text style={styles.monthGroupAmount}>₹{(item.income - item.expense).toFixed(2)}</Text>
      </View>

      {item.list.map((tx: any) => (
        <TxItem key={tx.id} item={tx} />
      ))}
    </View>
  );

  // -------- Add Transaction Submit --------
  const handleSaveTransaction = async () => {
    setSaveError(null);

    const amountNum = Number(formAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setSaveError("Please enter a valid amount.");
      return;
    }

    if (!formCategory) {
      setSaveError("Please select a category.");
      return;
    }

    // pick account: selectedAccountId -> first account -> DEFAULT_ACCOUNT_ID
    const fallbackAccountId = selectedAccountId || (accounts.length > 0 ? accounts[0].id : null) || DEFAULT_ACCOUNT_ID;

    const accObj = accounts.find((a: any) => a.id === fallbackAccountId) || null;

    const currency = accObj?.currency || DEFAULT_CURRENCY;

    // Build timestamp:
    const dateStr = formDate || getTodayDateString();
    const [yearStr, monthStr, dayStr] = dateStr.split("-");
    const now = new Date();
    const dateObj = new Date(
      Number(yearStr),
      Number(monthStr) - 1,
      Number(dayStr),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds()
    );
    const finalTimestamp = dateObj.toISOString();

    const finalAmount = formType === "expense" ? -Math.abs(amountNum) : Math.abs(amountNum);

    const payload = {
      account_id: fallbackAccountId,
      amount: finalAmount,
      currency,
      category: formCategory,
      description: formDescription || "",
      source: "manual",
      timestamp: finalTimestamp,
      raw_sms: null,
    };

    try {
      setSaving(true);
      await axios.post(`${API_BASE}/transactions`, payload);

      // refresh local lists
      fetchTransactions();
      // also trigger other screens to refresh if they have hooks
      if ((globalThis as any).__refreshTransactions) (globalThis as any).__refreshTransactions();
      if ((globalThis as any).__refreshTX) (globalThis as any).__refreshTX();
      if ((globalThis as any).__refreshAccounts) (globalThis as any).__refreshAccounts();
      if ((globalThis as any).__refreshStats) (globalThis as any).__refreshStats();

      setFormAmount("");
      setFormCategory("");
      setFormDescription("");
      setFormType("expense");
      setSelectedCategory(null);
      setFormDate(getTodayDateString());
      setAddModalVisible(false);
    } catch (err) {
      console.log("Save TX error", err);
      setSaveError("Failed to save transaction. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelAdd = () => {
    setAddModalVisible(false);
    setSelectedCategory(null);
    setFormDate(getTodayDateString());
  };

  const openAddModal = () => {
    setFormAmount("");
    setFormCategory("");
    setFormDescription("");
    setFormType("expense");
    setSelectedCategory(null);
    setFormDate(getTodayDateString());
    setSaveError(null);
    setAddModalVisible(true);
  };

  const handleDeleteTransaction = async (id: string) => {
    try {
      await axios.delete(`${API_BASE}/transactions/${id}`);

      // local removal
      setTransactions((prev) => prev.filter((tx) => tx.id !== id));
      setSelectedDateTx((prev) => prev.filter((tx) => tx.id !== id));
      setDeleteCandidateId(null);

      // notify other screens & refresh accounts/stats
      if ((globalThis as any).__refreshTransactions) (globalThis as any).__refreshTransactions();
      if ((globalThis as any).__refreshTX) (globalThis as any).__refreshTX();
      if ((globalThis as any).__refreshAccounts) (globalThis as any).__refreshAccounts();
      if ((globalThis as any).__refreshStats) (globalThis as any).__refreshStats();
    } catch (err) {
      console.log("Delete TX error", err);
      // optionally show an error message
    }
  };

  return (
    <View style={styles.container}>
      {/* -------- DATE MODAL -------- */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeader}>{selectedDate ? formatDay(selectedDate) : ""}</Text>

            <FlatList data={selectedDateTx} keyExtractor={(item) => item.id} renderItem={({ item }) => <TxItem item={item} />} />

            <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* -------- ADD TRANSACTION MODAL -------- */}
      <Modal visible={addModalVisible} transparent animationType="slide" onRequestClose={handleCancelAdd}>
        <View style={styles.modalOverlay}>
          <KeyboardAwareScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
            enableOnAndroid
            extraScrollHeight={20} // Adjust this value as needed
            keyboardOpeningTime={0}
          > 
            <View style={styles.addModalContentAuto}>
              <Text style={styles.modalHeader}>Add Transaction</Text>

              {/* Type toggle */}
              <View style={styles.typeRow}>
                <TouchableOpacity style={[styles.typeChip, formType === "expense" && styles.typeChipActiveExpense]} onPress={() => { setFormType("expense"); setSelectedCategory(null); setFormCategory(""); }}>
                  <Text style={[styles.typeChipText, formType === "expense" && styles.typeChipTextActive]}>Expense</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.typeChip, formType === "income" && styles.typeChipActiveIncome]} onPress={() => { setFormType("income"); setSelectedCategory(null); setFormCategory(""); }}>
                  <Text style={[styles.typeChipText, formType === "income" && styles.typeChipTextActive]}>Income</Text>
                </TouchableOpacity>
              </View>

              {/* Date */}
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Date</Text>
                <View style={styles.dateRow}>
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="YYYY-MM-DD" placeholderTextColor="#6b7280" value={formDate} onChangeText={setFormDate} />
                  <TouchableOpacity style={styles.todayChip} onPress={() => setFormDate(getTodayDateString())}>
                    <Text style={styles.todayChipText}>Today</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.dateHint}>Format: YYYY-MM-DD</Text>
              </View>

              {/* Account */}
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Account</Text>
                <View style={styles.accountChipRow}>
                  {accounts.map((acc: any) => (
                    <TouchableOpacity key={acc.id} style={[styles.accountChip, selectedAccountId === acc.id && styles.accountChipActive]} onPress={() => setSelectedAccountId(acc.id)}>
                      <Text style={[styles.accountChipText, selectedAccountId === acc.id && styles.accountChipTextActive]}>{acc.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Amount */}
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Amount (₹)</Text>
                <TextInput style={styles.input} keyboardType="numeric" placeholder="e.g. 400" placeholderTextColor="#6b7280" value={formAmount} onChangeText={setFormAmount} />
              </View>

              {/* Category */}
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryChipsRow}>
                  {currentCategories.map((cat) => {
                    const isActive = selectedCategory === cat;
                    return (
                      <TouchableOpacity key={cat} style={[styles.categoryChip, isActive && styles.categoryChipActive]} onPress={() => { setSelectedCategory(cat); setFormCategory(cat); }}>
                        <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>{cat}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Description */}
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput style={[styles.input, { height: 70, textAlignVertical: "top" }]} multiline placeholder="Optional note" placeholderTextColor="#6b7280" value={formDescription} onChangeText={setFormDescription} />
              </View>

              {saveError && <Text style={styles.errorText}>{saveError}</Text>}

              {/* Buttons */}
              <View style={styles.addButtonsRow}>
                <TouchableOpacity style={[styles.addButton, styles.addCancelButton]} onPress={handleCancelAdd} disabled={saving}>
                  <Text style={styles.addButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.addButton, styles.addSaveButton]} onPress={handleSaveTransaction} disabled={saving}>
                  <Text style={styles.addButtonText}>{saving ? "Saving..." : "Save"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      {/* -------- Header (Month vs Year) -------- */}
      {selectedTab === "Monthly" ? (
        <View style={styles.monthHeader}>
          <TouchableOpacity onPress={prevYear}>
            <Text style={styles.arrow}>{"<"}</Text>
          </TouchableOpacity>

          <Text style={styles.monthText}>{viewYear}</Text>

          <TouchableOpacity onPress={nextYear}>
            <Text style={styles.arrow}>{">"}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.monthHeader}>
          <TouchableOpacity onPress={prevMonth}>
            <Text style={styles.arrow}>{"<"}</Text>
          </TouchableOpacity>

          <Text style={styles.monthText}>{formatMonthLabel(month)}</Text>

          <TouchableOpacity onPress={nextMonth}>
            <Text style={styles.arrow}>{">"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* -------- Tabs -------- */}
      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <TouchableOpacity key={tab} style={[styles.tab, selectedTab === tab && styles.activeTab]} onPress={() => { setSelectedTab(tab); setSelectedDate(null); }}>
            <Text style={[styles.tabText, selectedTab === tab && styles.activeTabText]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.filterContainer}>
        {/* -------- Filter Row -------- */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              filterMode === "none" && styles.filterChipActive,
            ]}
            onPress={() => {
              setFilterMode("none");
              setFilterAccountId(null);
              setFilterCategory(null);
            }}
          >
            <Text
              style={[
                styles.filterChipText,
                filterMode === "none" && styles.filterChipTextActive,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              filterMode === "account" && styles.filterChipActive,
            ]}
            onPress={() => {
              setFilterMode("account");
              setFilterCategory(null);
            }}
          >
            <Text
              style={[
                styles.filterChipText,
                filterMode === "account" && styles.filterChipTextActive,
              ]}
            >
              Account
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              filterMode === "category" && styles.filterChipActive,
            ]}
            onPress={() => {
              setFilterMode("category");
              setFilterAccountId(null);
            }}
          >
            <Text
              style={[
                styles.filterChipText,
                filterMode === "category" && styles.filterChipTextActive,
              ]}
            >
              Category
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sub chips */}
        {/* #change-filter selector */}
        {filterMode === "account" && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {accounts.map((acc) => (
              <TouchableOpacity
                key={acc.id}
                style={[
                  styles.filterChip,
                  filterAccountId === acc.id && styles.filterChipActive,
                ]}
                onPress={() => setFilterAccountId(acc.id)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterAccountId === acc.id && styles.filterChipTextActive,
                  ]}
                >
                  {acc.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {filterMode === "category" && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {ALL_CATEGORIES.map((cat, idx) => (
              <TouchableOpacity
                key={`cat-${idx}-${cat}`}
                style={[
                  styles.filterChip,
                  filterCategory === cat && styles.filterChipActive,
                ]}
                onPress={() => setFilterCategory(cat)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterCategory === cat && styles.filterChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* -------- Summary Row -------- */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryBox, { borderColor: "#6ee7b7" }]}>
          <Text style={styles.summaryLabel}>Income</Text>
          <Text style={[styles.summaryValue, { color: "#bbf7d0" }]}>₹{summaryIncome.toFixed(2)}</Text>
        </View>

        <View style={[styles.summaryBox, { borderColor: "#fb7185" }]}>
          <Text style={styles.summaryLabel}>Expense</Text>
          <Text style={[styles.summaryValue, { color: "#fecaca" }]}>₹{summaryExpense.toFixed(2)}</Text>
        </View>

        <View style={[styles.summaryBox, { borderColor: "#93c5fd" }]}>
          <Text style={styles.summaryLabel}>Total</Text>
          <Text style={[styles.summaryValue, { color: summaryTotal >= 0 ? "#bfdbfe" : "#fed7d7" }]}>₹{summaryTotal.toFixed(2)}</Text>
        </View>
      </View>

      {/* -------- MAIN CONTENT -------- */}
      {selectedTab === "Calendar" ? (
        <View style={{ flex: 1 }}>
          <View style={styles.calendarHeader}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <Text key={d} style={styles.calendarHeaderText}>
                {d}
              </Text>
            ))}
          </View>

          {calendarMatrix.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.calendarRow}>
              {row.map((day, colIndex) => {
                if (!day) return <View key={colIndex} style={styles.calendarCellEmpty} />;

                const [y, m] = month.split("-");
                const dayStr = `${y}-${m}-${String(day).padStart(2, "0")}`;

                const dayTx = currentMonthTx.filter((tx) => {
                  if (!tx.timestamp) return false;
                  const txDate = tx.timestamp.split("T")[0];
                  return txDate === dayStr;
                });

                const hasTx = dayTx.length > 0;
                let dotColor = "#fb7185";
                if (hasTx) {
                  // compute net excluding transfers
                  const net = dayTx.filter((t) => t.source !== "transfer").reduce((sum, tx) => sum + (tx.amount || 0), 0);
                  if (net > 0) dotColor = "#22c55e"; // green if positive
                  else if (net < 0) dotColor = "#fb7185"; // red if negative
                  else dotColor = "#e5e7eb"; // grey-ish if exactly 0
                }

                return (
                  <TouchableOpacity
                    key={colIndex}
                    style={styles.calendarCell}
                    onPress={() => {
                      setSelectedDate(dayStr);
                      setSelectedDateTx(dayTx);
                      setModalVisible(true);
                    }}
                  >
                    <Text style={styles.calendarDate}>{day}</Text>
                    {hasTx && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      ) : selectedTab === "Daily" ? (
        <FlatList data={groupedDaily} keyExtractor={(item: any) => item.date} renderItem={renderDailyGroup} />
      ) : selectedTab === "Monthly" ? (
        <FlatList data={yearMonthlyGroups} keyExtractor={(item: any) => item.key} renderItem={renderMonthGroup} />
      ) : (
        // Total tab – show all up to selected month, with small date at bottom
        <FlatList data={filteredTotalTx} keyExtractor={(item: any) => item.id} renderItem={({ item }) => <TxItem item={item} showDate />} />
      )}

      {/* -------- Floating + Button -------- */}
      {(selectedTab === "Daily" || selectedTab === "Monthly" || selectedTab === "Total") && (
        <TouchableOpacity style={styles.fab} onPress={openAddModal}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// -------- Styles --------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617", // deep dark
    padding: 16,
  },

  monthHeader: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  arrow: { fontSize: 22, color: "#e5e7eb", paddingHorizontal: 16 },
  monthText: { fontSize: 18, color: "#f9fafb", fontWeight: "bold" },

  tabs: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
    backgroundColor: "#020617",
    borderRadius: 999,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  activeTab: {
    backgroundColor: "#111827",
  },
  tabText: { color: "#9ca3af", fontSize: 14 },
  activeTabText: { color: "#e5e7eb", fontWeight: "600" },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  summaryBox: {
    width: "32%",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: "#020617",
    borderWidth: 1.2,
  },
  summaryLabel: { color: "#9ca3af", fontSize: 12, marginBottom: 4 },
  summaryValue: { color: "#f9fafb", fontSize: 15, fontWeight: "bold" },

  // Daily group header
  dayHeaderContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  dayHeaderPill: {
    backgroundColor: "#111827",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  dayHeaderDateText: {
    color: "#e5e7eb",
    fontSize: 13,
    fontWeight: "600",
  },
  dayAmount: { color: "#9ca3af", fontSize: 13 },

  // Monthly group header
  monthGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  monthGroupPill: {
    backgroundColor: "#111827",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  monthGroupText: {
    color: "#e5e7eb",
    fontSize: 13,
    fontWeight: "600",
  },
  monthGroupAmount: {
    color: "#9ca3af",
    fontSize: 13,
  },

  cardWrapper: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 10,
  },
  cardAccent: {
    width: 4,
    borderRadius: 999,
    marginRight: 8,
  },
  card: {
    flex: 1,
    backgroundColor: "#020617",
    paddingVertical: 13,
    paddingHorizontal: 13,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f2937",
    marginBottom: 0.5,
  },
  cardLeft: {
    width: 100,
    marginRight: 2,
  },
  cardCenter: {
    flex: 1,
    justifyContent: "center",
  },
  cardRight: {
    minWidth: 80,
    alignItems: "flex-end",
    justifyContent: "center",
    marginLeft: 8,
  },
  category: {
    fontSize: 15,
    color: "#c4c7ccff",
  },
  desc: {
    color: "#e5e7eb",
    fontSize: 14,
  },
  descPlaceholder: {
    color: "#6b7280",
    fontSize: 13,
    fontStyle: "italic",
  },
  accountLabel: {
    color: "#9ca3af",
    fontSize: 11.5,
    marginTop: 1,
  },
  amount: {
    fontSize: 17,
    fontWeight: "bold",
  },
  cardDate: {
    marginTop: 2,
    color: "#6b7280",
    fontSize: 11.5,
  },

  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 6,
  },
  calendarHeaderText: {
    color: "#9ca3af",
    fontSize: 13,
    width: 40,
    textAlign: "center",
  },

  calendarRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 8,
  },
  calendarCell: {
    width: 40,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  calendarCellEmpty: {
    width: 40,
    height: 48,
    backgroundColor: "transparent",
  },
  calendarDate: { color: "#e5e7eb", fontSize: 15 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.75)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#020617",
    padding: 20,
    paddingBottom: 32,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "70%",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  addModalContent: {
    backgroundColor: "#020617",
    padding: 20,
    paddingBottom: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  modalHeader: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f9fafb",
    marginBottom: 16,
    textAlign: "center",
  },
  addModalContentAuto: {
    backgroundColor: "#020617",
    padding: 20,
    paddingBottom: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#1f2937",
    width: "100%",
  },
  closeBtn: {
    marginTop: 20,
    backgroundColor: "#020617",
    padding: 12,
    borderRadius: 999,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  closeText: { color: "#e5e7eb", fontWeight: "600" },

  typeRow: {
    flexDirection: "row",
    marginBottom: 16,
    justifyContent: "center",
  },
  typeChip: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1f2937",
    marginHorizontal: 6,
    backgroundColor: "#020617",
  },
  typeChipActiveExpense: {
    backgroundColor: "#3b1f2b",
    borderColor: "#fb7185",
  },
  typeChipActiveIncome: {
    backgroundColor: "#123524",
    borderColor: "#22c55e",
  },
  typeChipText: {
    color: "#e5e7eb",
    fontSize: 14,
  },
  typeChipTextActive: {
    fontWeight: "600",
  },

  fieldBlock: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: "#e5e7eb",
    marginBottom: 6,
    fontSize: 14,
  },
  input: {
    backgroundColor: "#020617",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#f9fafb",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  errorText: {
    color: "#fb7185",
    marginTop: 4,
    fontSize: 13,
  },

  // date row
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  todayChip: {
    marginLeft: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#111827",
  },
  todayChipText: {
    color: "#e5e7eb",
    fontSize: 12,
    fontWeight: "600",
  },
  dateHint: {
    color: "#6b7280",
    fontSize: 11,
    marginTop: 4,
  },

  // category chips
  categoryChipsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  categoryChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1f2937",
    marginRight: 8,
    backgroundColor: "#020617",
  },
  categoryChipActive: {
    backgroundColor: "#111827",
    borderColor: "#fb7185",
  },
  categoryChipText: {
    color: "#e5e7eb",
    fontSize: 13,
  },
  categoryChipTextActive: {
    fontWeight: "600",
    color: "#fecaca",
  },

  // account chips
  accountChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  accountChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#020617",
  },
  accountChipActive: {
    backgroundColor: "#111827",
    borderColor: "#60a5fa",
  },
  accountChipText: {
    color: "#e5e7eb",
    fontSize: 13,
  },
  accountChipTextActive: {
    fontWeight: "600",
    color: "#dbeafe",
  },
  accountHint: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 4,
  },

  addButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
  },
  addButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    marginLeft: 8,
  },
  addCancelButton: {
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  addSaveButton: {
    backgroundColor: "#22c55e",
  },
  addButtonText: {
    color: "#f9fafb",
    fontWeight: "600",
  },

  fab: {
    position: "absolute",
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fb7185",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: {
    color: "#f9fafb",
    fontSize: 32,
    lineHeight: 34,
    fontWeight: "bold",
  },
  cardDelete: {
    backgroundColor: "rgba(127, 29, 29, 0.75)", // deep red glassy
    borderColor: "#ef4444",
  },
  cardAccentDelete: {
    backgroundColor: "#ef4444",
  },
  deleteTitle: {
    color: "#fee2e2",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  deleteSub: {
    color: "#fecaca",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  // #change-filter styles
  filterContainer: {
    marginTop: 1,
    marginBottom: 16, // ⬅️ creates air before summary
  },
  filterRow: {
    flexDirection: "row",
    marginTop: 6,      // #change-ui-fix
    marginBottom: 10,  // #change-ui-fix
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1.5,     // fixed
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderColor: "#1f2937",
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: "#1e293b",
    borderColor: "#38bdf8",
  },
  filterChipText: {
    color: "#9ca3af",
    fontSize: 13,
  },
  filterChipTextActive: {
    color: "#e0f2fe",
    fontWeight: "600",
  },

});
