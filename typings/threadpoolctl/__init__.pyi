from types import TracebackType
from typing import Self

class threadpool_limits:  # noqa: N801 - upstream API name
    def __init__(self, limits: int) -> None: ...
    def __enter__(self) -> Self: ...
    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None: ...

def threadpool_info() -> list[dict[str, object]]: ...
