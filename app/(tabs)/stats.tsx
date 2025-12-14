import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from "react-native";
import axios from "axios";
import { PieChart } from "react-native-gifted-charts";
import { API_BASE } from "../../constants/api";

type TxType = "expense" | "income";
type ViewMode = "Monthly" | "Total";

function getInitialMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthStr: string) {
  const [y, m] = monthStr.split("-");
  const date = new Date(Number(y), Number(m) - 1);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export default function StatsScreen() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [month, setMonth] = useState(getInitialMonth());
  const [viewMode, setViewMode] = useState<ViewMode>("Monthly");
  const [txType, setTxType] = useState<TxType>("expense"); // default Expenses

  const fetchTransactions = () => {
    axios
      .get(`${API_BASE}/transactions`)
      .then((res) => setTransactions(res.data || []))
      .catch((err) => console.log("Stats error", err));
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  useEffect(() => {
    const fn = () => {
      fetchTransactions();
    };

    (globalThis as any).__refreshStats = fn;

    return () => {
      if ((globalThis as any).__refreshStats === fn) {
        (globalThis as any).__refreshStats = undefined;
      }
    };
  }, []);


  // ----- Date navigation -----
  function prevMonth() {
    const [y, m] = month.split("-");
    const date = new Date(Number(y), Number(m) - 2);
    setMonth(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    );
  }

  function nextMonth() {
    const [y, m] = month.split("-");
    const date = new Date(Number(y), Number(m));
    setMonth(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    );
  }

  // ----- Filtered list based on view mode + type -----
  const filteredTx = useMemo(() => {
    let base: any[] = [];

    if (viewMode === "Monthly") {
      const [y, m] = month.split("-");
      base = transactions.filter((tx) => {
        if (!tx.timestamp) return false;
        const [dy, dm] = tx.timestamp.split("T")[0].split("-");
        return dy === y && dm === m;
      });
    } else {
      base = transactions;
    }

    // exclude transfers from statistics entirely
    base = base.filter((tx) => tx.source !== "transfer");

    if (txType === "expense") {
      return base.filter((tx) => tx.amount < 0);
    } else {
      return base.filter((tx) => tx.amount > 0);
    }
  }, [transactions, month, viewMode, txType]);

  // ----- Category aggregation -----
  const { categoryStats, totalAmount } = useMemo(() => {
    const map: Record<string, { category: string; amount: number }> = {};
    let total = 0;

    filteredTx.forEach((tx) => {
      const cat = tx.category || "Others";
      const value = Math.abs(tx.amount || 0);

      if (!map[cat]) {
        map[cat] = { category: cat, amount: 0 };
      }
      map[cat].amount += value;
      total += value;
    });

    const arr = Object.values(map).sort((a, b) => b.amount - a.amount);

    return { categoryStats: arr, totalAmount: total };
  }, [filteredTx]);

  // ----- Pie chart data (no external labels) -----
  const COLORS = [
    "#fb7185",
    "#facc15",
    "#34d399",
    "#38bdf8",
    "#a855f7",
    "#f97316",
    "#22c55e",
    "#e5e7eb",
  ];

  const pieData =
    totalAmount > 0
      ? categoryStats.map((c, idx) => ({
          value: c.amount,
          color: COLORS[idx % COLORS.length],
        }))
      : [];

  // ----- Render category row (shows % + amount) -----
  const renderCategoryRow = ({ item, index }: { item: any; index: number }) => {
    const pct = totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0;

    return (
      <View style={styles.catRow}>
        <View
          style={[
            styles.catColorBar,
            { backgroundColor: COLORS[index % COLORS.length] },
          ]}
        />
        <View style={styles.catTextBlock}>
          <Text style={styles.catName}>{item.category}</Text>
          <Text style={styles.catPct}>{pct.toFixed(1)}%</Text>
        </View>
        <Text style={styles.catAmount}>₹{item.amount.toFixed(2)}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Month header */}
      <View style={styles.monthHeader}>
        <TouchableOpacity onPress={prevMonth}>
          <Text style={styles.arrow}>{"<"}</Text>
        </TouchableOpacity>

        <Text style={styles.monthText}>
          {viewMode === "Monthly" ? formatMonthLabel(month) : "All Time"}
        </Text>

        <TouchableOpacity onPress={nextMonth} disabled={viewMode === "Total"}>
          <Text
            style={[
              styles.arrow,
              viewMode === "Total" && { opacity: 0.3 },
            ]}
          >
            {">"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Mode chips: Monthly / Total */}
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[
            styles.modeChip,
            viewMode === "Monthly" && styles.modeChipActive,
          ]}
          onPress={() => setViewMode("Monthly")}
        >
          <Text
            style={[
              styles.modeText,
              viewMode === "Monthly" && styles.modeTextActive,
            ]}
          >
            Monthly
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeChip,
            viewMode === "Total" && styles.modeChipActive,
          ]}
          onPress={() => setViewMode("Total")}
        >
          <Text
            style={[
              styles.modeText,
              viewMode === "Total" && styles.modeTextActive,
            ]}
          >
            Total
          </Text>
        </TouchableOpacity>
      </View>

      {/* Type chips: Expenses / Income */}
      <View style={styles.typeRow}>
        <TouchableOpacity
          style={[
            styles.typeChip,
            txType === "expense" && styles.typeChipActiveExpense,
          ]}
          onPress={() => setTxType("expense")}
        >
          <Text
            style={[
              styles.typeChipText,
              txType === "expense" && styles.typeChipTextActive,
            ]}
          >
            Expenses
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.typeChip,
            txType === "income" && styles.typeChipActiveIncome,
          ]}
          onPress={() => setTxType("income")}
        >
          <Text
            style={[
              styles.typeChipText,
              txType === "income" && styles.typeChipTextActive,
            ]}
          >
            Income
          </Text>
        </TouchableOpacity>
      </View>

      {/* Chart + total label */}
      <View style={styles.chartCard}>
        {totalAmount > 0 ? (
          <PieChart
            data={pieData}
            donut
            radius={90}
            innerRadius={55}
            innerCircleColor="#020617" // matches background -> no big white hole
            focusOnPress
            centerLabelComponent={() => (
              <View style={styles.centerLabel}>
                <Text style={styles.centerLabelTitle}>
                  {txType === "expense" ? "Spent" : "Received"}
                </Text>
                <Text style={styles.centerLabelAmount}>
                  ₹{totalAmount.toFixed(0)}
                </Text>
              </View>
            )}
          />
        ) : (
          <View style={styles.emptyChart}>
            <Text style={styles.emptyText}>
              No {txType === "expense" ? "expenses" : "income"} in this view.
            </Text>
          </View>
        )}
      </View>

      {/* Category list */}
      <View style={styles.listHeaderRow}>
        <Text style={styles.listHeaderTitle}>By Category</Text>
        {totalAmount > 0 && (
          <Text style={styles.listHeaderSub}>
            Total ₹{totalAmount.toFixed(2)}
          </Text>
        )}
      </View>

      <FlatList
        data={categoryStats}
        keyExtractor={(item) => item.category}
        renderItem={renderCategoryRow}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

// ------- Styles -------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
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

  // Monthly / Total chips
  modeRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 10,
  },
  modeChip: {
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1f2937",
    marginHorizontal: 6,
    backgroundColor: "#020617",
  },
  modeChipActive: {
    backgroundColor: "#83a5ef51",
    borderColor: "#71c1fbff",
  },
  modeText: {
    color: "#9ca3af",
    fontSize: 13,
  },
  modeTextActive: {
    color: "#cae5feff",
    fontWeight: "600",
  },

  // Expense / Income chips
  typeRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
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

  chartCard: {
    backgroundColor: "#020617",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#1f2937",
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: "center",
    marginBottom: 16,
  },
  centerLabel: {
    alignItems: "center",
  },
  centerLabelTitle: {
    color: "#9ca3af",
    fontSize: 12,
  },
  centerLabelAmount: {
    color: "#f9fafb",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 4,
  },
  emptyChart: {
    height: 180,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 13,
  },

  listHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  listHeaderTitle: {
    color: "#e5e7eb",
    fontSize: 14,
    fontWeight: "600",
  },
  listHeaderSub: {
    color: "#9ca3af",
    fontSize: 12,
  },

  catRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1f2937",
    marginBottom: 8,
  },
  catColorBar: {
    width: 6,
    height: 32,
    borderRadius: 999,
    marginRight: 10,
  },
  catTextBlock: {
    flex: 1,
  },
  catName: {
    color: "#f9fafb",
    fontSize: 14,
    marginBottom: 2,
  },
  catPct: {
    color: "#9ca3af",
    fontSize: 12,
  },
  catAmount: {
    color: "#e5e7eb",
    fontSize: 14,
    fontWeight: "600",
  },
});
