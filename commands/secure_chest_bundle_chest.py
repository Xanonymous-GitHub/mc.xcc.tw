from typing import Final, Optional
from hashlib import sha256
import sys
import subprocess


def copy_to_clipboard(text: str):
    platform = sys.platform
    if platform == "win32":  # Windows
        subprocess.run(
            ['clip.exe'], input=text.strip().encode('utf-16'), check=True
        )
    elif platform == "darwin":  # macOS
        subprocess.run(
            ['pbcopy'], input=text.encode('utf-8'), check=True
        )
    elif platform == "linux" or platform == "linux2":  # Linux
        # This requires 'xclip' to be installed. If not available, an alternative approach is needed.
        subprocess.run(
            ['xclip', '-selection', 'c'], input=text.encode('utf-8'), check=True
        )
    else:
        print(f"Platform {platform} not supported")


def generate_bundle_chest(
    *,
    item: str,
    target_lock: Optional[str] = '357435485636',
    item_nbt: Optional[str] = None,
    item_smart_id: Optional[str] = None,
    target: str = "chest",
    slots: int = 27,
    count_of_each_slot: int = 64,
) -> str:
    items: Final[list[str]] = [
        "{" + f"Slot:{slot},id:{item},Count:{count_of_each_slot},{f'tag:{item_nbt}' if item_nbt else ''}" + "}"
        for slot in range(slots)
    ]

    # item_smart_id = sha256(f"{target_lock}\n".encode()).hexdigest()[:8]

    result: Final[list[str]] = [
        'give',
        '@p',
        ''.join((
            f'minecraft:{target}',
            "{",
            "BlockEntityTag:{{Lock:\"{0}\",Items:[{1}]}},".format(
                f"KEY[{target_lock}]",
                ",".join(items),
            ),
            'display:{Name:\'["",{"text":"SCB ","italic":false,"bold":true},{"text":"[","italic":false,"bold":true,"color":"gold"},{"text":"SID","italic":false,"bold":true,"color":"#0066cc"},{"text":"]","italic":false,"bold":true,"color":"gold"}]\'},'.replace(
                "SID", item_smart_id or item
            ),
            "Enchantments:[{}],",
            "Unbreakable:1b,"
            "}",
        )),
    ]

    copy_to_clipboard(" ".join(result))
    print("Command has been copied to clipboard.")


def main():
    the_item = input("what is the item in the chest: ").strip()
    the_nbt = input("what is the nbt of these items: ").strip()
    the_item_smart_id = input("what is the smart id of each item: ").strip()
    
    assert the_item, "Item is required"

    generate_bundle_chest(
        item=the_item,
        item_nbt=the_nbt,
        item_smart_id=the_item_smart_id,
    )


if __name__ == "__main__":
    main()
