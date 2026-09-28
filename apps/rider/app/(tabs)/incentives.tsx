import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@repo/mobile-ui/components/ui/text";

import { Screen } from "../../components/Screen";
import { PickerIncentives } from "../../components/incentives/PickerIncentives";
import { RiderIncentives } from "../../components/incentives/RiderIncentives";
import { useCrewRole } from "../../providers/CrewProvider";

/**
 * Incentives. Riders get the design's earnings screen; pickers keep their
 * performance screen, since a picker earns no delivery fees to chart.
 */
export default function IncentivesRoute() {
  const role = useCrewRole();
  const insets = useSafeAreaInsets();

  if (role !== "rider") return <PickerIncentives />;

  return (
    <Screen withTabBar>
      <View
        style={{ paddingTop: insets.top + 12 }}
        className="gap-[14px] pb-space-7"
      >
        <Text
          weight="bold"
          className="text-[24px] leading-[30px] tracking-h2 text-strong"
        >
          Incentives
        </Text>
        <RiderIncentives />
      </View>
    </Screen>
  );
}
