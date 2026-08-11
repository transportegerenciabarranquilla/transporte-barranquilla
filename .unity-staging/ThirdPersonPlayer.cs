using UnityEngine;

[RequireComponent(typeof(CharacterController))]
public sealed class ThirdPersonPlayer : MonoBehaviour
{
    [SerializeField] private float walkSpeed = 5.5f;
    [SerializeField] private float sprintSpeed = 8.5f;
    [SerializeField] private float jumpHeight = 1.6f;
    [SerializeField] private float gravity = -24f;
    [SerializeField] private float turnSpeed = 14f;

    private CharacterController controller;
    private Transform cameraTransform;
    private float verticalVelocity;
    private bool dead;
    private bool stunned;
    private float movementMultiplier = 1f;

    public void SetDead(bool value)
    {
        dead = value;
        if (!dead) verticalVelocity = 0f;
    }

    public void SetStunned(bool value) => stunned = value;
    public void SetMovementMultiplier(float value) => movementMultiplier = Mathf.Clamp(value, 0.1f, 1f);

    private void Awake()
    {
        controller = GetComponent<CharacterController>();
    }

    private void Start()
    {
        cameraTransform = Camera.main != null ? Camera.main.transform : null;
    }

    private void Update()
    {
        if (dead || stunned) return;
        if (cameraTransform == null && Camera.main != null) cameraTransform = Camera.main.transform;

        Vector2 input = ReadMovement();
        Vector3 forward = cameraTransform != null ? cameraTransform.forward : Vector3.forward;
        Vector3 right = cameraTransform != null ? cameraTransform.right : Vector3.right;
        forward.y = 0f;
        right.y = 0f;
        forward.Normalize();
        right.Normalize();

        Vector3 direction = Vector3.ClampMagnitude(forward * input.y + right * input.x, 1f);
        bool sprinting = Input.GetKey(KeyCode.LeftShift);
        float speed = (sprinting ? sprintSpeed : walkSpeed) * movementMultiplier;

        if (direction.sqrMagnitude > 0.01f)
        {
            Quaternion targetRotation = Quaternion.LookRotation(direction);
            transform.rotation = Quaternion.Slerp(transform.rotation, targetRotation, turnSpeed * Time.deltaTime);
        }

        if (controller.isGrounded && verticalVelocity < 0f) verticalVelocity = -2f;
        if (controller.isGrounded && Input.GetKeyDown(KeyCode.Space))
        {
            verticalVelocity = Mathf.Sqrt(jumpHeight * -2f * gravity);
        }

        verticalVelocity += gravity * Time.deltaTime;
        Vector3 velocity = direction * speed;
        velocity.y = verticalVelocity;
        controller.Move(velocity * Time.deltaTime);

        Animator animator = GetComponentInChildren<Animator>();
        if (animator != null)
        {
            float animationSpeed = direction.magnitude * (sprinting ? 1f : 0.55f);
            animator.SetFloat("Speed", animationSpeed, 0.12f, Time.deltaTime);
        }
    }

    private static Vector2 ReadMovement()
    {
        float horizontal = Input.GetAxisRaw("Horizontal");
        float vertical = Input.GetAxisRaw("Vertical");
        return new Vector2(horizontal, vertical).normalized;
    }
}
