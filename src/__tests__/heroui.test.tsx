import { Button } from "@heroui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("HeroUI Button", () => {
  it("calls onPress when clicked", async () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>Run workflow</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Run workflow" }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
